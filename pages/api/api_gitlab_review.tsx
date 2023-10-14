import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import { ChatOpenAI } from "langchain/chat_models/openai";
import { HumanMessage, SystemMessage } from "langchain/schema";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { loadSummarizationChain } from "langchain/chains";
import { PromptTemplate } from "langchain/prompts";
import type { NextApiRequest, NextApiResponse } from 'next'
import { GitlabReviewResponse, ReviewData } from '../interface/gitlab_response';
import { z } from "zod";
import { StructuredOutputParser } from "langchain/output_parsers";
import { RunnableSequence } from "langchain/schema/runnable";

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

function setResponseError(statusCode: number, message: string, response: NextApiResponse<GitlabReviewResponse>) {
    response.status(statusCode).json({
        message: message,
        result: null
    })
}

async function cloneAndListFiles(url: string, response: NextApiResponse<GitlabReviewResponse>) {
    // Define the directory where you want to clone the repository
    const cloneDirectory = `./././reviews/${url.split("/").pop()}`;

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
        }

        // Execute the Git ls-tree command inside the cloned repository directory
        const { stdout: listStdout, stderr: listStderr } = await execAsync(listFilesCommand, { cwd: cloneDirectory });

        if (listStderr) {
            setResponseError(500, `Error listing files in the repository: ${listStderr}`, response)
            return
        }

        // Split the stdout into an array of file paths
        const fileList = listStdout.trim().split('\n');

        filterFilesUsingOpenAI(fileList, cloneDirectory, response)
    } catch (error) {
        setResponseError(500, error.message, response)
    }
}

// use below function to perform review about the structure folder
async function reviewStructureFolderUsingOpenAI() {

}

async function filterFilesUsingOpenAI(files: string[], cloneDirectory: string, response: NextApiResponse<GitlabReviewResponse>) {
    const result = await chatModel.call([
        new SystemMessage(`
    You're a senior Javascript developer, please do a review with below apps structure project

    the subject of review is:
    1. folder structure => maintanable, readable, and scalable
    2. code structure => maintanable, readable, and scalable
    `),
        new HumanMessage(`
    Your first task will be select files from data below that you are interest for code review

    ${files} 
    `),
    ]);

    const result2 = await chatModel.call([
        new HumanMessage(`
    Please remove the number and format the result to array of string from data below

    ${result.content} 
    `),
    ]);

    let filteredFiles: string[] = JSON.parse(result2.content)

    getTheContent(filteredFiles, cloneDirectory, response)
}

async function getTheContent(files: string[], cloneDirectory: string, response: NextApiResponse<GitlabReviewResponse>) {
    let allDocs: any[] = []

    for await (const [i, file] of files.entries()) {
        if (file.includes("learning")) continue

        const catCommand = `cat ${file}`;

        const { stdout: singleStdout, stderr: singleStderr } = await execAsync(catCommand, { cwd: cloneDirectory });

        if (singleStderr) continue

        const response = await chatModel.call([
            new SystemMessage(`
      You're a senior web developer that will help us to review the others developer projects code
      `),
            new HumanMessage(`
      please review below code, the subject for review is maintanability, readability, and scalability

      please include pros and cons about each review subject

      ${singleStdout.trim()} 
      `),
        ]);

        const textSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 400, chunkOverlap: 400 / 5 });
        const docs = await textSplitter.createDocuments([response.content]);

        allDocs.push(...docs)
    }

    if (allDocs.length === 0) {
        setResponseError(500, "Failed to send data to OpenAI", response)
        return
    }

    summarizeAllDocs(allDocs, response)
}

async function summarizeAllDocs(documents: Document[], response: NextApiResponse<GitlabReviewResponse>) {
    console.log("summarizeAllDocs begin...")

    const chain = loadSummarizationChain(chatModel, {
        type: "map_reduce",
        combinePrompt: PromptTemplate.fromTemplate(`
    Please summarize the review and make pros and cons including the detail for each item, then please give score (0-100) from the review you just make

    example result:

    *Maintainability:

    Pros:
    1. Pros 1: Explanation of pros 1
    2. Pros 2: Explanation of pros 2 
    3. Pros 3...
    4. etc...

    Cons:
    1. Cons 1: Explanation of cons 1
    2. Cons 2: Explanation of cons 2
    3. Cons 3: Explanation of cons 3
    4. Cons 4...
    5. etc...

    *Readability:

    Pros:
    1. Pros 1: Explanation of pros 1
    2. Pros 2: Explanation of pros 2
    3. Pros 3: Explanation of pros 3
    4. Pros 4...
    5. etc...

    Cons:
    1. Cons 1: Explanation of cons 1
    2. Cons 2: Explanation of cons 2
    3. Cons 3: Explanation of cons 3
    4. Cons 4...
    5. etc...

    *Scalability:

    Pros:
    1. Pros 1: Explanation of pros 1
    2. Pros 2: Explanation of pros 2
    3. Pros 3...
    4. etc...

    Cons:
    1. Cons 1: Explanation of cons 1
    2. Cons 2: Explanation of cons 2
    3. Cons 3: Explanation of cons 3
    4. Cons 4...
    5. etc...

    *Summary of the review
    `)
    });

    try {
        const res = await chain.call({
            input_documents: documents,
        });
    
        formatTheAllSummaryToJSON(res.text, response)  
    } catch (error) {
        setResponseError(500, `${error}`, response)
    } 
}

async function formatTheAllSummaryToJSON(result: string, response: NextApiResponse<GitlabReviewResponse>) {
    const parser = StructuredOutputParser.fromZodSchema(
        z.object({
            maintainability: z.object({
                pros: z.array(
                    z.object({
                        title: z.string(),
                        explanation: z.string()
                    })
                ).describe("array for showing the data relevant to maintainability section that pros with the review"),
                cons: z.array(
                    z.object({
                        title: z.string(),
                        explanation: z.string()
                    })
                ).describe("array for showing the data relevant to maintainability section that cons with the review")
            }).describe("object for maintainability section"),
            readability: z.object({
                pros: z.array(
                    z.object({
                        title: z.string(),
                        explanation: z.string()
                    })
                ).describe("array for showing the data relevant to readability section that pros with the review"),
                cons: z.array(
                    z.object({
                        title: z.string(),
                        explanation: z.string()
                    })
                ).describe("array for showing the data relevant to readability section that cons with the review")
            }).describe("object for readability section"),
            scalability: z.object({
                pros: z.array(
                    z.object({
                        title: z.string(),
                        explanation: z.string()
                    })
                ).describe("array for showing the data relevant to scalability section that pros with the review"),
                cons: z.array(
                    z.object({
                        title: z.string(),
                        explanation: z.string()
                    })
                ).describe("array for showing the data relevant to scalability section that cons with the review")
            }).describe("object for scalability section"),
            summary: z.string().describe("sources used to answer the question, should be websites."),
            score: z.number().describe("score for overall review, the value will be 0-100")
        })
    );

    const chain = RunnableSequence.from([
        PromptTemplate.fromTemplate(
        `
            Format the data according to the instruction
            
            instruction:
            {format_instructions}
            
            data:
            {data}
        `
        ),
        chatModel,
        parser,
    ])

    try {
        const chainResponse = await chain.invoke({
            format_instructions: parser.getFormatInstructions(),
            data: result,
        })
    
        response.status(200).json({
            message: "Berhasil melakukan review",
            result: {
                maintainability: chainResponse.maintainability,
                readability: chainResponse.readability,
                scalability: chainResponse.scalability,
                summary: chainResponse.summary,
                score: chainResponse.score
            }
        })
    } catch (error) {
        setResponseError(500, `${error}`, response)
    }
}

export default async function handler(request: NextApiRequest, response: NextApiResponse<GitlabReviewResponse>) {
    const url = request.body.url || '';

    if (url.trim().length === 0) {
        setResponseError(400, "URL repo tidak boleh kosong!", response)
        return
    }

    try {
        cloneAndListFiles(url, response)
    } catch (error) {
        console.log(error)

        if (error.response) {
            setResponseError(error.response.status, error.response.data, response)
        } else {
            setResponseError(500, "An error occurred during your request.", response)
        }
    }
}