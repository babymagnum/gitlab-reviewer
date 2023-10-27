import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import { ChatOpenAI } from "langchain/chat_models/openai";
import { HumanMessage, SystemMessage } from "langchain/schema";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { loadQAMapReduceChain, LLMChain, loadSummarizationChain, MapReduceDocumentsChain, StuffDocumentsChain } from "langchain/chains";
import type { NextApiRequest, NextApiResponse } from 'next'
import { GitlabReviewResponseV2 } from '../interface/gitlab_response';
import { PromptTemplate } from 'langchain/prompts';
import { Document } from 'langchain/dist/document';
import { MemoryVectorStore } from "langchain/vectorstores/memory";

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

function setResponseError(statusCode: number, message: string, response: NextApiResponse<GitlabReviewResponseV2>) {
    response.status(statusCode).json({
        message: message,
        result: null,
        resultArray: []
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
    const result = await chatModel(0, 1).call([
        new SystemMessage(`
        You're a senior web developer, please help us to review this projects code

        The subject of review is:
        1. Maintanable
        2. Readable
        3. Scalable
        4. Secure

        Your task will select files that you are interested for code review, please select the most important file in your point of view, your selected files should mimic whole of the application

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
        files:
        ${files.map(element => `${element}\n`).toString().replaceAll(',', '')} 
    `),
    ]);

    console.log(`Result ==> ${result.content}`)

    try {
        let filteredFiles: string[] = JSON.parse(result.content)

        getTheContent(filteredFiles, customParameter, cloneDirectory, response)
    } catch (error) {
        setResponseError(500, `${error}`, response)
    }
}

async function getTheContent(files: string[], customParameter: string[], cloneDirectory: string, response: NextApiResponse<GitlabReviewResponseV2>) {
    let pageContents: string[] = []
    let finalScore: number = 0

    for await (const [i, file] of files.entries()) {
        const catCommand = `cat ${file}`

        const { stdout: singleStdout, stderr: singleStderr } = await execAsync(catCommand, { cwd: cloneDirectory });

        if (singleStderr || singleStdout === "") continue

        const result = await chatModel(0.1, 1).call([
            new SystemMessage(`
            You're a senior web developer that will help us to review the code, please be honest with your review, and always include the reason behind your review

            Criteria that grouped by subject (Maintanable, Readable, Scalable, Secure):
            * Maintanable:    
            1. is the code structure simple and easy to understand?   
            2. is the code modularized?   
            3. is the code follows a consistent style and formatting?   
            4. is the code well-organized and follows a consistent coding style?   
            5. is the code properly commented and documented to aid in understanding and maintenance?

            * Readable:   
            1. is the code written using consistent and clear coding style, such as consistent indentation, spacing, and capitalization?   
            2. is the code uses descriptive variable and component names?   
            3. is the code easy to read and understand?   
            4. is the code properly commented to explain the purpose and functionality of different sections or blocks of code?
            5. is the code free from unnecessary complexity and excessive nesting, making it easier to follow and debug?

            * Scalable:   
            1. is the code structure modular and follows the component-based architecture?   
            2. is the code snippet can be easily reused and scaled in different parts of the application?   
            3. is the code designed to easily add new features or functionality without causing conflicts or breaking existing functionality?   
            4. is the code flexible and adaptable to changes or updates in the system requirements?   
            5. is the code designed to be easily extended or modified to accommodate future changes or additions to the system?

            * Secure:   
            1. is the code does not contain any sensitive information or vulnerabilities that could? compromise the security of the application?   
            2. Does the code implement proper error handling and logging to detect and respond to security incidents?   
            3. Does the code use secure coding practices to prevent common security vulnerabilities?
            4. Does the code implement proper input validation and sanitization to prevent malicious input from being processed?   
            5. Does the code encrypt sensitive data when it is stored or transmitted?

            Your task:
            Create 5 review from each of the criteria above, so you have to create 20 reviews in total.

            Please follow below rule:
            1. Your review must combine of positive and negative review.
            2. Each review should be unique based on the criteria above.
            3. Proof of evidence IS A MUST! please always include it in the review.
            4. If your evidence is code snippet, use SHORT CODE SNIPPET instead of full block of code.
            5. You have to create total 20 reviews based on the criteria! 

            Your output should be in CSV format, please refer to example below

            Example:
            1;"<criteria>";"<value may Positive/Neutral/Negative>";"filepath from the provided data";"Proof of Evidence to help human reviewer understand the context without opening the source code <evidence may contain functionname, lines of code, code of snippet, variable name,module name>";"<Score: score based on this review, Positive +5, Negative -1, Neutral 0>";"<Current score: this review score + (previous Score)>"
            ... continue to next record until 20 reviews created ...
            20;"<criteria>";"<value may Positive/Neutral/Negative>";"filepath from the provided data";"Proof of Evidence to help human reviewer understand the context without opening the source code <evidence may contain functionname, lines of code, code of snippet, variable name, module name>";"<Score: score based on this review, Positive +5, Negative -1, Neutral 0>";"<Current score: this review score + (previous Score)>"
            `),
            new HumanMessage(`
            Filepath: ${file}

            Full source code:

            ${singleStdout}

            === end of code ===

            Create 20 reviews item from code above
            `),
        ]);

        console.log(`${file} ==> ${result.content}`)

        const score = result.content.slice(-10).split(";").pop().replaceAll(`"`, "")
        console.log(`reviewScore ==> ${score}`)
        finalScore += Number(score)

        pageContents.push(result.content)
    }

    console.log(`finalScore (${finalScore}) ==> ${finalScore / 2}`)
    generateFinalResult(pageContents, finalScore / 2, customParameter, response)
}

async function generateFinalResult(pageContents: string[], finalScore: number, customParameter: string[], response: NextApiResponse<GitlabReviewResponseV2>) {
    let finalResult: FinalResultItem = {
        rawReviews: pageContents,
        finalScore: finalScore
    }

    response.status(200).json({
        message: 'berhasil',
        result: '',
        resultArray: pageContents,
        resultFinal: finalResult
    })
}

async function getSummaryOfEachParameter(pageContents: string[], customParameter: string[], response: NextApiResponse<GitlabReviewResponseV2>) {
    let allDocs: Document[] = []
    let finalResult: FinalResultItem = {
        rawReviews: pageContents,
        finalScore: 20
    }

    // split character for every content
    for await (const content of pageContents) {
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 2000,
            chunkOverlap: 200,
        });

        const docs = await splitter.createDocuments([content])

        allDocs.push(...docs)
    }

    // insert the splitted char to vector store
    const vectorStore = await MemoryVectorStore.fromDocuments(
        allDocs, embeddings
    )

    const chain = loadQAMapReduceChain(chatModel(0, 1))

    const result = await chain.call({
        input_documents: allDocs,
        question: `
        You're a helpful assistant that will help to grouping review data by the subject

        Subject of review:
        1. Maintanable
        2. Readable
        3. Scalable
        4. Secure

        your output should be the same of original data, please refer to example below

        Example:
        ${customParameter.slice(0, customParameter.length > 1 ? 2 : 1).map(element => {
            return `
            "${element}";"Positive/Negative";"Description why this point of review is important";"filepath from the provided data";"Proof of Evidence, may contains function name/variable name/short code snippet with line number, Example: 
            ${Math.random() < 0.5 ?
                    `function onDecimalInputChange(e, type) {
                    const amount = e.target.value;
                
                    if (!amount || amount.match(/^\d{1,}(\.\d{0,2})?$/)) {
                      // this.setState(() => ({ amount }));
                      if (type === "temperature") {
                        console.log("update temperature");
                        setTemperatureInput(amount);
                      } else if (type === "top-p") {
                        console.log("update top-p");
                        setTopPInput(amount);
                      }
                    }
                }` :
                    `getCity({int? provinceId}) async {
                  final response = await _userRepo.getCity(provinceId ?? (province.value.id ?? 0).toInt());
                        cityState(response.isLeft() ? RequestState.ERROR : RequestState.SUCCESS);
                
                    response.fold((error) {}, (data) {
                      cities.assignAll(data);
                    });
                }`
                }
            "
            `
        })}        
        `
    })

    finalResult.allReviews = result.text

    response.status(200).json({
        message: 'berhasil',
        result: '',
        resultArray: pageContents,
        resultFinal: finalResult
    })
}
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