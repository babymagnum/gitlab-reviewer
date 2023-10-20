import { exec } from 'child_process';
import { promisify } from 'util';
import { ChatOpenAI } from "langchain/chat_models/openai";
import { HumanMessage, SystemMessage } from "langchain/schema";
import type { NextApiRequest, NextApiResponse } from 'next'
import { FileItem } from '../../interface/file_item';
import { FileContentResponse } from '../responses/get_file_content_response';

const execAsync = promisify(exec);

const chatModel = new ChatOpenAI({
    temperature: 0.15,
    topP: 0.85,
    maxTokens: -1,
    verbose: false,
    azureOpenAIApiKey: "ae283827498e4794963e3d423b0e9bf3",
    azureOpenAIApiVersion: "2023-07-01-preview",
    azureOpenAIApiDeploymentName: "gpt-35-turbo",
    azureOpenAIBasePath: "https://devcodejp.openai.azure.com/openai/deployments",
});

function setResponseError(statusCode: number, message: string, response: NextApiResponse<FileContentResponse>) {
    response.status(statusCode).json({
        message: message,
        result: null
    })
}

export default async function getTheContent(request: NextApiRequest, response: NextApiResponse<FileContentResponse>) {
    const customParameter = request.body.custom_parameter || ''
    const customOutput = request.body.custom_output || ''
    const cloneDirectory = request.body.clone_directory || ''
    let fileItem: FileItem = request.body.file_item

    const catCommand = `cat ${fileItem.filePath}`

    const { stdout: singleStdout, stderr: singleStderr } = await execAsync(catCommand, { cwd: cloneDirectory });

    if (singleStderr) {
        setResponseError(500, "Gagal mendapatkan file content", response)
        return
    }

    const result = await chatModel.call([
        new SystemMessage(`
      You're a senior web developer that will help us to review the others developer projects code
      `),
        new HumanMessage(`
      please review below code, the subject for review is ${customParameter}

      please include ${customOutput} as part of the output

      ${singleStdout.trim()} 
      `),
    ]);

    fileItem.review = result.content

    response.status(200).json({
        message: 'Berhasil mendapatkan file content',
        result: fileItem
    })
}