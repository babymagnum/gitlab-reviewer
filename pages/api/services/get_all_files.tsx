import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import { ChatOpenAI } from "langchain/chat_models/openai";
import { HumanMessage, SystemMessage } from "langchain/schema";
import type { NextApiRequest, NextApiResponse } from 'next'
import { AllFilesResponse } from '../responses/get_all_files_response';
import { FileItem, StateEnum } from '../../interface/file_item';

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

function setResponseError(statusCode: number, message: string, response: NextApiResponse<AllFilesResponse>) {
    response.status(statusCode).json({
        message: message,
        result: null,
        cloneDirectory: null
    })
}

export default async function cloneAndListFiles(request: NextApiRequest, response: NextApiResponse<AllFilesResponse>) {
    const url = request.body.url || ''
    const customParameter = request.body.custom_parameter || ''

    // Define the directory where you want to clone the repository
    const cloneDirectory = `././././reviews/${url.split("/").pop()}`

    try {
        // Git clone command
        const cloneCommand = `git clone ${url} ${cloneDirectory}`

        // Git ls-tree command
        const listFilesCommand = `git ls-tree --full-tree -r --name-only HEAD`

        // Check if the directory already exists
        if (!fs.existsSync(cloneDirectory)) {
            // If it doesn't exist, create it
            // Execute the Git clone command
            await execAsync(cloneCommand);
            console.log(`Git repository cloned to ${cloneDirectory}`)
        } else {
            console.log(`${cloneDirectory} is exist`)
        }

        // Execute the Git ls-tree command inside the cloned repository directory
        const { stdout: listStdout, stderr: listStderr } = await execAsync(listFilesCommand, { cwd: cloneDirectory })

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

async function filterFilesUsingOpenAI(files: string[], customParameter: string, cloneDirectory: string, response: NextApiResponse<AllFilesResponse>) {
    const result = await chatModel.call([
        new SystemMessage(`
    You're a senior web developer, please do a review with below apps structure project

    the subject of review is ${customParameter}
    `),
        new HumanMessage(`
    Your first task will select files from data below that you are interest for code review

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

    console.log('== Filtered Files ==\n')
    filteredFiles.forEach((element, index) => {
        console.log(`${index + 1}. ${element}`)
    })

    response.status(200).json({
        message: "Berhasil mendapatkan list files",
        result: filteredFiles.map(element => new FileItem(element, "", StateEnum.IDLE)),
        cloneDirectory: cloneDirectory
    })
}