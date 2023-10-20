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

const chatModel = new ChatOpenAI({
    temperature: 0.15,
    topP: 0.85,
    maxTokens: -1,
    verbose: true,
    azureOpenAIApiKey: "ae283827498e4794963e3d423b0e9bf3",
    azureOpenAIApiVersion: "2023-07-01-preview",
    azureOpenAIApiDeploymentName: "gpt-35-turbo",
    azureOpenAIBasePath: "https://devcodejp.openai.azure.com/openai/deployments",
});

const embeddings = new OpenAIEmbeddings({
    azureOpenAIApiKey: "ae283827498e4794963e3d423b0e9bf3",
    azureOpenAIApiVersion: "2023-07-01-preview",
    azureOpenAIApiDeploymentName: "embedding-ada-002",
    azureOpenAIBasePath: "https://devcodejp.openai.azure.com/openai/deployments",
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
    const result = await chatModel.call([
        new SystemMessage(`
    You're a senior web developer, please help us to review this projects code    
    `),
        new HumanMessage(`
    Your first task will be select files from data below that you are interested for code review, the subject of review is:
    ${customParameter.map((element, index) => `${index + 1}. ${element}`)}

    files:
    ${files}
    `),
    ]);

    console.log(`Result ==> ${result.content}`)

    const result2 = await chatModel.call([
        new HumanMessage(`
    please cleanse the data below to only filepath and format it in array of string

    the result should look like this, no prefix number in the begining of item:
    [
        "xxx", "xxx", "xxx"
    ]

    ${result.content}
    `),
    ]);

    console.log(`Result2 ==> ${result2.content}`)

    let filteredFiles: string[] = JSON.parse(result2.content)

    console.log('== Filtered Files ==\n')
    filteredFiles.forEach((element, index) => {
        console.log(`${index + 1}. ${element}`)
    })

    getTheContent(filteredFiles, customParameter, cloneDirectory, response)
}

async function getTheContent(files: string[], customParameter: string[], cloneDirectory: string, response: NextApiResponse<GitlabReviewResponseV2>) {
    let allDocs: Document[] = []
    let pageContents: string[] = []

    for await (const [i, file] of files.entries()) {
        if (file.includes("learning") || file.toLowerCase().includes("readme")) continue

        const catCommand = `cat ${file}`

        const { stdout: singleStdout, stderr: singleStderr } = await execAsync(catCommand, { cwd: cloneDirectory });

        if (singleStderr || singleStdout === "") continue

        const prompt2 = PromptTemplate.fromTemplate(`
        You're a senior web developer that will help us to review the code below, please be honest with your review, and always include the reason behind your review (it can be code snippet or logical explanation)

        Filename: ${file}

        Subject of your review will be:
        {review_subject}

        The result should exactly looks like this:
        {example_result}

        Code snippet:
        {code}

        Review:
        `)

        const chain = new LLMChain({
            llm: chatModel, prompt: prompt2,
        })

        const response = await chain.call({
            code: singleStdout.trim(),
            review_subject: customParameter.map((element, index) => `${index + 1}. ${element}\n`),
            example_result: customParameter.map(element => {
                return `
                *${element}

                - Positive:
                1. This is example of positive review 
                [part of code: the code snipper]
                [filename: name of the file]
                
                2. This is example of another positive review
                [part of code: the code snippet]
                [filename: name of the file]

                - Negative:
                1. This is example of bad review
                [part of code: please find the code snippet that relate to your negative feedback]
                [filename: name of the file]

                2. This is example of another bad review
                [part of code: please find the code snipept that relate to your negative feedback]
                [filename: name of the file]
                `
            })
        });

        console.log(`${file} ==> ${response.text}`)

        const textSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 2000, chunkOverlap: 2000 / 5 });
        const docs = await textSplitter.createDocuments([response.text]);

        // allDocs.push(new Document({
        //     pageContent: response.text
        // }))

        allDocs.push(...docs)
        pageContents.push(response.text)
    }

    if (allDocs.length === 0) {
        setResponseError(500, "Failed to send data to OpenAI", response)
        return
    }

    getSummaryOfEachParameter(pageContents, customParameter, response)

    // summarizeAllDocs(allDocs, customParameter, response)
}

async function getSummaryOfEachParameter(pageContents: string[], customParameter: string[], response: NextApiResponse<GitlabReviewResponseV2>) {
    let allDocs: Document[] = []
    let finalResult: FinalResultItem[] = []

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

    // Search for the most similar document
    for await (const _parameter of customParameter) {
        // positive
        const positiveReview = await vectorStore.similaritySearch(`${_parameter} positive`)

        // negative
        const negativeReview = await vectorStore.similaritySearch(`${_parameter} negative`)

        let result: FinalResultItem = {
            parameter: _parameter,
            positive: positiveReview.map(element => element.pageContent),
            negative: negativeReview.map(element => element.pageContent),
            summaryPositive: '',
            summaryNegative: ''
        }

        finalResult.push(result)
    }

    for await (const [index, _result] of finalResult.entries()) {
        const chain = loadQAMapReduceChain(chatModel);

        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 2000, chunkOverlap: 200
        })
        const docsPositive = await splitter.createDocuments([_result.positive.toString()])
        const docsNegative = await splitter.createDocuments([_result.negative.toString()])

        const resultPositive = await chain.call({
            input_documents: docsPositive,
            question: `
            Can you please remove any Negative related content and remove any similar content from the sets of reviews and then create the summary?

            The summary should looks like this:
            Positive:
            1. This is example of positive review 
            [code: the code snipper]
            [filename: name of the file]
                
            2. This is example of another positive review
            [code: the code snippet]
            [filename: name of the file]
            `,
        });

        const resultNegative = await chain.call({
            input_documents: docsNegative,
            question: `
            Can you please remove any Positive related content and also remove the similar content from the sets of reviews and then create the summary?

            The summary should looks like this:
            Negative:
            1. This is example of bad review
            [code: the code snippet]
            [filename: name of the file]

            2. This is example of another bad review
            [code: the code snippet]
            [filename: name of the file]
            `,
        });

        _result.summaryPositive = resultPositive.text
        _result.summaryNegative = resultNegative.text

        finalResult[index] = _result
    }

    response.status(200).json({
        message: 'berhasil',
        result: '',
        resultArray: pageContents,
        resultFinal: finalResult
    })
}

async function summarizeAllDocsNew(documents: Document[], customParameter: string[], response: NextApiResponse<GitlabReviewResponseV2>) {
    console.log("summarizeAllDocs begin...")

    const prompt = PromptTemplate.fromTemplate(`
        You're a senior web developer that will help us to review the code

        the subject for review is: 
        ${customParameter.map((element, index) => `${index + 1}. ${element}\n`)}

        please give explanation of each subject that mentioned above in your review as a list and the max result is 2000 character

        code:
        {code}
        `)

    const mapChain = new LLMChain({
        llm: chatModel, prompt,
    })

    let reduceChain = new LLMChain({
        llm: chatModel, prompt: PromptTemplate.fromTemplate(`
        The following is set of reviews:

        {reviews}

        Summarize the above reviews with all the key details
        
        the result should looks like this:
        ${customParameter.map(element => {
            `
            *${element}:
            1. explanation1
            2. explanation2
            3. ...
            4. ...
            `
        })}
        `)
    })

    // let reduceChain = new LLMChain({
    //     llm: chatModel, prompt: PromptTemplate.fromTemplate(`
    //     The following is set of reviews:

    //     ${documents.map((element, index) => {
    //         `Review ${index + 1} ==>             
    //         ${element}\n`
    //     })}

    //     Summarize the above reviews with all the key details

    //     the result should looks like this:
    //     ${customParameter.map(element => {
    //         `
    //         *${element}:
    //         1. explanation1
    //         2. explanation2
    //         3. ...
    //         4. ...
    //         `
    //     })}
    //     `)
    // })

    const mapReduceChain = new MapReduceDocumentsChain({
        llmChain: mapChain,
        maxTokens: 4000,
        documentVariableName: 'code',
        combineDocumentChain: new StuffDocumentsChain({
            llmChain: reduceChain, documentVariableName: 'reviews'
        })
    })

    const result = await mapReduceChain.call({
        input_documents: documents
    })

    console.log(result)
}

async function summarizeAllDocs(documents: Document[], customParameter: string[], response: NextApiResponse<GitlabReviewResponseV2>) {
    console.log("summarizeAllDocs begin...")

    const template = PromptTemplate.fromTemplate(`
    Please summarize the set of reviews
    
    the result should looks like this:
    ${customParameter.map(element => {
        return `
        *${element}:
        1. explanation1
        2. explanation2
        3. ...
        4. ...
        `
    })}
    `);

    const chain = loadSummarizationChain(chatModel, {
        // combinePrompt: template,
        type: "map_reduce",
        combinePrompt: template
        // combineLLM: chatModel,
        // combinePrompt: template,
        // combineMapPrompt: template
    });

    try {
        const res = await chain.call({
            input_documents: documents,
        });

        response.status(200).json({
            result: res.text,
            message: "berhasil"
        })
    } catch (error) {
        setResponseError(500, `${error}`, response)
    }
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