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
    azureOpenAIApiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
    azureOpenAIApiVersion: process.env.NEXT_PUBLIC_OPENAI_API_VERSION,
    azureOpenAIApiDeploymentName: process.env.NEXT_PUBLIC_OPENAI_API_NAME,
    azureOpenAIBasePath: process.env.NEXT_PUBLIC_OPENAI_API_BASE,
});

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