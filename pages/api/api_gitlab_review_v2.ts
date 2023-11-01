import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import { ChatOpenAI } from "langchain/chat_models/openai";
import { HumanMessage, SystemMessage } from "langchain/schema";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import type { NextApiRequest, NextApiResponse } from 'next'
import { GitlabReviewResponseV2 } from '../interface/gitlab_response';
import { SelectedFilterFileItem } from '../interface/selected_filter_file_item';
import { maintanabilityPrompt, readabilityPrompt, reliabilityPrompt, securityPrompt } from './prompts';
import { OverallReviewItem, ReviewItem } from '../interface/overall_review_item';

const execAsync = promisify(exec);

function chatModel(temperature?: number, top_p?: number): ChatOpenAI {
    return new ChatOpenAI({
        temperature: temperature || 0.15,
        topP: top_p || 0.85,
        maxTokens: -1,
        verbose: true,
        azureOpenAIApiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
        azureOpenAIApiVersion: process.env.NEXT_PUBLIC_OPENAI_API_VERSION,
        azureOpenAIApiDeploymentName: process.env.NEXT_PUBLIC_OPENAI_API_NAME,
        azureOpenAIBasePath: process.env.NEXT_PUBLIC_OPENAI_API_BASE,
    })
}

const embeddings = new OpenAIEmbeddings({
    azureOpenAIApiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
    azureOpenAIApiVersion: process.env.NEXT_PUBLIC_OPENAI_API_VERSION,
    azureOpenAIApiDeploymentName: process.env.NEXT_PUBLIC_OPENAI_API_EMBEDDING_NAME,
    azureOpenAIBasePath: process.env.NEXT_PUBLIC_OPENAI_API_BASE,
});

export default async function handler(request: NextApiRequest, response: NextApiResponse<GitlabReviewResponseV2>) {
    const url = request.body.url || '';
    const customParameter: string[] = request.body.custom_parameter || [];

    if (url.trim().length === 0) {
        setResponseError(400, "URL repo tidak boleh kosong!", response)
        return
    }

    try {
        cloneAndListFiles(url, customParameter, response)
    } catch (error) {
        console.log(error)

        if (error.response) {
            setResponseError(error.response.status, error.response.data, response)
        } else {
            setResponseError(500, "An error occurred during your request.", response)
        }
    }
}

function setResponseError(statusCode: number, message: string, response: NextApiResponse<GitlabReviewResponseV2>) {
    response.status(statusCode).json({
        message: message,
    })
}

async function cloneAndListFiles(url: string, customParameter: string[], response: NextApiResponse<GitlabReviewResponseV2>) {
    // Define the directory where you want to clone the repository
    const cloneDirectory = `././././reviews/${url.split("/").pop()}`;

    try {
        // Git clone command
        const cloneCommand = `git clone ${url} ${cloneDirectory}`;

        // Git ls-tree command
        const listFilesCommand = `git ls-tree --full-tree -r --name-only HEAD`;

        // Check if the directory already exists
        if (!fs.existsSync(cloneDirectory)) {
            // If it doesn't exist, create it
            // Execute the Git clone command
            await execAsync(cloneCommand);
            console.log(`Git repository cloned to ${cloneDirectory}`);
        } else {
            console.log(`${cloneDirectory} is exist`)
        }

        // Execute the Git ls-tree command inside the cloned repository directory
        const { stdout: listStdout, stderr: listStderr } = await execAsync(listFilesCommand, { cwd: cloneDirectory });

        if (listStderr) {
            setResponseError(500, `Error listing files in the repository: ${listStderr}`, response)
            return
        }

        // Split the stdout into an array of file paths
        const fileList = listStdout.trim().split('\n');

        console.log('== All Files in Repo ==\n')
        fileList.forEach((element, index) => {
            console.log(`${index + 1}. ${element}`)
        })

        filterFilesUsingOpenAI(fileList, customParameter, cloneDirectory, response)
    } catch (error) {
        setResponseError(500, error.message, response)
    }
}

async function filterFilesUsingOpenAI(files: string[], customParameter: string[], cloneDirectory: string, response: NextApiResponse<GitlabReviewResponseV2>) {
    let allSelectedFiles: SelectedFilterFileItem[] = []
    const subjects = ['Maintanability', 'Readability', 'Reliability', 'Security']    

    try {
        for await (const subject of subjects) {
            const result = await chatModel(0, 1).call([
                new SystemMessage(`
                You're a senior web developer that will help us to select files that you are interested for code review, please select the most important files in your point of view
    
                Task:
                You have to find files that related to ${subject} aspect
    
                Please follow below rule:
                1. you can only select maximum 2 files from the data
                2. Don't select file that related to document or image!
                3. your output will be on json array and the content is filepath only
    
                Example:
                [
                "path/file1.js", "path/file2.js"
                ]
                `),
                new HumanMessage(`
                Files:
                ${files.map(element => `${element}\n`).toString().replaceAll(',', '')} 
            `),
            ]);

            console.log(`Filtered Files ${subject} ==> ${result.content}`)

            let filteredFiles: string[] = JSON.parse(result.content)
            const _allSelected = filteredFiles.map(element => {
                return {
                    filepath: element,
                    subject: subject
                } as SelectedFilterFileItem
            })

            allSelectedFiles.push(..._allSelected)
        }

        getTheContent(allSelectedFiles, customParameter, cloneDirectory, response)
    } catch (e) {
        setResponseError(500, `${e}`, response)
    }

    // try {
    //     let filteredFiles: string[] = JSON.parse(result.content)

    //     getTheContent(filteredFiles, customParameter, cloneDirectory, response)
    // } catch (error) {
        
    // }
}

async function getTheContent(allSelectedFiles: SelectedFilterFileItem[], customParameter: string[], cloneDirectory: string, response: NextApiResponse<GitlabReviewResponseV2>) {
    let overallReviews: OverallReviewItem[] = []

    const maintanabilityFiles = allSelectedFiles.filter((element, _, __) => element.subject === 'Maintanability')
    let maintanabilityHumanPrompt = ''
    const readabilityFiles = allSelectedFiles.filter((element, _, __) => element.subject === 'Readability')
    let readabilityHumanPrompt = ''
    const reliabilityFiles = allSelectedFiles.filter((element, _, __) => element.subject === 'Reliability')
    let reliabilityHumanPrompt = ''
    const securityFiles = allSelectedFiles.filter((element, _, __) => element.subject === 'Security')
    let securityHumanPrompt = ''

    // maintanability process
    for await (const [index, file] of maintanabilityFiles.entries()) {
        const catCommand = `cat ${file.filepath}`

        const { stdout: singleStdout, stderr: singleStderr } = await execAsync(catCommand, { cwd: cloneDirectory });

        if (singleStderr || singleStdout === "") continue

        if (index !== maintanabilityFiles.length - 1) {
            maintanabilityHumanPrompt += `
            File ${index + 1}: ${file.filepath}

            File ${index + 1} Source code:

            ${singleStdout}

            ====== End of file ${index + 1} ======
            `
            continue
        } else {
            maintanabilityHumanPrompt += `
            File ${index + 1}: ${file}

            File ${index + 1} Source code:

            ${singleStdout}

            ====== End of file ${index + 1} ======

            Please remember that you have to create 5 reviews and your output must be in CSV format! 
            Then create summary in the end of your review!
            `

            const result = await chatModel(0.1, 1).call([
                new SystemMessage(maintanabilityPrompt),
                new HumanMessage(maintanabilityHumanPrompt),
            ]);
    
            console.log(`Maintanability Result ==> ${result.content}`)
    
            overallReviews.push(formatTheCSV('Maintanability', result.content))
        }        
    }

    // readability process
    for await (const [index, file] of readabilityFiles.entries()) {
        const catCommand = `cat ${file.filepath}`

        const { stdout: singleStdout, stderr: singleStderr } = await execAsync(catCommand, { cwd: cloneDirectory });

        if (singleStderr || singleStdout === "") continue

        if (index !== readabilityFiles.length - 1) {
            readabilityHumanPrompt += `
            File ${index + 1}: ${file.filepath}

            File ${index + 1} Source code:

            ${singleStdout}

            ====== End of file ${index + 1} ======
            `
            continue
        } else {
            readabilityHumanPrompt += `
            File ${index + 1}: ${file}

            File ${index + 1} Source code:

            ${singleStdout}

            ====== End of file ${index + 1} ======

            Please remember that you have to create 5 reviews and your output must be in CSV format! 
            Then create summary in the end of your review!
            `

            const result = await chatModel(0.1, 1).call([
                new SystemMessage(readabilityPrompt),
                new HumanMessage(readabilityHumanPrompt),
            ]);
    
            console.log(`Readability Result ==> ${result.content}`)
    
            overallReviews.push(formatTheCSV('Readability', result.content))
        }        
    }

    // reliability process
    for await (const [index, file] of reliabilityFiles.entries()) {
        const catCommand = `cat ${file.filepath}`

        const { stdout: singleStdout, stderr: singleStderr } = await execAsync(catCommand, { cwd: cloneDirectory });

        if (singleStderr || singleStdout === "") continue

        if (index !== reliabilityFiles.length - 1) {
            reliabilityHumanPrompt += `
            File ${index + 1}: ${file.filepath}

            File ${index + 1} Source code:

            ${singleStdout}

            ====== End of file ${index + 1} ======
            `
            continue
        } else {
            reliabilityHumanPrompt += `
            File ${index + 1}: ${file}

            File ${index + 1} Source code:

            ${singleStdout}

            ====== End of file ${index + 1} ======

            Please remember that you have to create 5 reviews and your output must be in CSV format! 
            Then create summary in the end of your review!
            `

            const result = await chatModel(0.1, 1).call([
                new SystemMessage(reliabilityPrompt),
                new HumanMessage(reliabilityHumanPrompt),
            ]);
    
            console.log(`Reliability Result ==> ${result.content}`)
    
            overallReviews.push(formatTheCSV('Reliability', result.content))
        }        
    }

    // security process
    for await (const [index, file] of securityFiles.entries()) {
        const catCommand = `cat ${file.filepath}`

        const { stdout: singleStdout, stderr: singleStderr } = await execAsync(catCommand, { cwd: cloneDirectory });

        if (singleStderr || singleStdout === "") continue

        if (index !== securityFiles.length - 1) {
            securityHumanPrompt += `
            File ${index + 1}: ${file.filepath}

            File ${index + 1} Source code:

            ${singleStdout}

            ====== End of file ${index + 1} ======
            `
            continue
        } else {
            securityHumanPrompt += `
            File ${index + 1}: ${file}

            File ${index + 1} Source code:

            ${singleStdout}

            ====== End of file ${index + 1} ======

            Please remember that you have to create 5 reviews and your output must be in CSV format! 
            Then create summary in the end of your review!
            `

            const result = await chatModel(0.1, 1).call([
                new SystemMessage(securityPrompt),
                new HumanMessage(securityHumanPrompt),
            ]);
    
            console.log(`Security Result ==> ${result.content}`)
    
            overallReviews.push(formatTheCSV('Security', result.content))
        }        
    }

    let finalScore = 0
    overallReviews.forEach(reviews => {
        finalScore += reviews.score
    });

    response.status(200).json({
        message: 'berhasil',
        resultFinal: overallReviews,
        finalScore: finalScore
    })
}

function formatTheCSV(subject: string, result: string): OverallReviewItem {
    const resultArray = result.split('\n')        
    let reviews: ReviewItem[] = []
    let summary = ''
    let score = 0

    resultArray.forEach((result, index) => {        
        const data = result.split(';')
        let review: ReviewItem = {}

        data.forEach((data, index) => {
            if (index === 1) review.keyword = data
            if (index === 2) {
                review.reviewStatus = data
                review.score = data.includes('Negative') ? -1 : data.includes('Positive') ? 5 : 0
            }
            if (index === 3) review.filepath = data
            if (index === 4) review.proofOfEvidence = data
        });

        if (index <= 4) reviews.push(review)
        else summary = result
    });

    const totalPositive = reviews.filter((element, _, __) => (element.reviewStatus || '').includes('Positive'))
    const totalNegative = reviews.filter((element, _, __) => (element.reviewStatus || '').includes('Negative'))
    score = (totalPositive.length * 5) - (totalNegative.length * 1)

    return {
        reviews: reviews,
        summary: summary,
        score: score,
        subject: subject
    }
}

// async function getSummaryOfEachParameter(pageContents: string[], customParameter: string[], response: NextApiResponse<GitlabReviewResponseV2>) {
//     let allDocs: Document[] = []
//     let finalResult: FinalResultItem = {
//         rawReviews: pageContents,
//         finalScore: 20
//     }

//     // split character for every content
//     for await (const content of pageContents) {
//         const splitter = new RecursiveCharacterTextSplitter({
//             chunkSize: 2000,
//             chunkOverlap: 200,
//         });

//         const docs = await splitter.createDocuments([content])

//         allDocs.push(...docs)
//     }

//     // insert the splitted char to vector store
//     const vectorStore = await MemoryVectorStore.fromDocuments(
//         allDocs, embeddings
//     )

//     const chain = loadQAMapReduceChain(chatModel(0, 1))

//     const result = await chain.call({
//         input_documents: allDocs,
//         question: `
//         You're a helpful assistant that will help to grouping review data by the subject

//         Subject of review:
//         1. Maintanable
//         2. Readable
//         3. Scalable
//         4. Secure

//         your output should be the same of original data, please refer to example below

//         Example:
//         ${customParameter.slice(0, customParameter.length > 1 ? 2 : 1).map(element => {
//             return `
//             "${element}";"Positive/Negative";"Description why this point of review is important";"filepath from the provided data";"Proof of Evidence, may contains function name/variable name/short code snippet with line number, Example: 
//             ${Math.random() < 0.5 ?
//                     `function onDecimalInputChange(e, type) {
//                     const amount = e.target.value;
                
//                     if (!amount || amount.match(/^\d{1,}(\.\d{0,2})?$/)) {
//                       // this.setState(() => ({ amount }));
//                       if (type === "temperature") {
//                         console.log("update temperature");
//                         setTemperatureInput(amount);
//                       } else if (type === "top-p") {
//                         console.log("update top-p");
//                         setTopPInput(amount);
//                       }
//                     }
//                 }` :
//                     `getCity({int? provinceId}) async {
//                   final response = await _userRepo.getCity(provinceId ?? (province.value.id ?? 0).toInt());
//                         cityState(response.isLeft() ? RequestState.ERROR : RequestState.SUCCESS);
                
//                     response.fold((error) {}, (data) {
//                       cities.assignAll(data);
//                     });
//                 }`
//                 }
//             "
//             `
//         })}        
//         `
//     })

//     response.status(200).json({
//         message: 'berhasil',
//         resultFinal: finalResult
//     })
// }