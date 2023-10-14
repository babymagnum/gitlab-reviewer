import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import { ChatOpenAI } from "langchain/chat_models/openai";
import { HumanMessage, SystemMessage } from "langchain/schema";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { loadSummarizationChain } from "langchain/chains";
import { PromptTemplate } from "langchain/prompts";
import { z } from "zod";
import { StructuredOutputParser } from "langchain/output_parsers";
import { RunnableSequence } from "langchain/schema/runnable";
import { GitlabReviewResponse, ReviewData } from '../interface/gitlab_response';

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

// Define the URL of the Git repository to clone
const gitRepositoryURL = 'https://github.com/babymagnum/langchain_example'; // Replace with your Git repository URL

// Define the directory where you want to clone the repository
const cloneDirectory = `../../../reviews/${gitRepositoryURL.split("/").pop()}`; // Replace with your desired directory name

async function cloneAndListFiles() {
  try {
    // Git clone command
    const cloneCommand = `git clone ${gitRepositoryURL} ${cloneDirectory}`;

    // Git ls-tree command
    const listFilesCommand = `git ls-tree --full-tree -r --name-only HEAD`;

    // Check if the directory already exists
    if (!fs.existsSync(cloneDirectory)) {
      // If it doesn't exist, create it
      // Execute the Git clone command
      await execAsync(cloneCommand);
      console.log(`Git repository cloned to ${cloneDirectory}`);
    } else {
      console.log(`Directory ${cloneDirectory} already exists.`);
    }

    // Execute the Git ls-tree command inside the cloned repository directory
    const { stdout: listStdout, stderr: listStderr } = await execAsync(listFilesCommand, { cwd: cloneDirectory });

    if (listStderr) {
      throw new Error(`Error listing files in the repository: ${listStderr}`);
    }

    // Split the stdout into an array of file paths
    const fileList = listStdout.trim().split('\n');

    filterFilesUsingOpenAI(fileList)
  } catch (error) {
    console.error(error.message);
  }
}

// use below function to perform review about the structure folder
async function reviewStructureFolderUsingOpenAI() {

}

async function filterFilesUsingOpenAI(files: string[]) {
  const response = await chatModel.call([
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

  const response2 = await chatModel.call([
    new HumanMessage(`
    Please remove the number and format the result to array of string from data below

    ${response.content} 
    `),
  ]);

  JSON.parse(response2.content).forEach((element: any) => {
    console.log(element)
  });

  let filteredFiles: string[] = JSON.parse(response2.content)

  getTheContent(filteredFiles)
}

async function getTheContent(files: string[]) {
  // Git ls-tree command
  let allDocs: any[] = []

  for await (const [i, file] of files.entries()) {

    if (file.includes("learning")) continue

    console.log(`opening ${file}`)

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

    console.log(`allDocs length ==> ${allDocs.length}`)
  }

  summarizeAllDocs(allDocs)
}

async function summarizeAllDocs(documents: Document[]) {
  console.log("summarizeAllDocs begin...")

  const chain = loadSummarizationChain(chatModel, {
    type: "map_reduce",
    combinePrompt: PromptTemplate.fromTemplate(`
    Please summarize the review and make pros and cons including the detail for each item, then please give score (0-100) from the review you just make

    example result:

    =======

    *Maintainability:

    Pros:
    1. Modular Code: The code is organized into separate modules and follows good separation of concerns, making it easier to maintain.
    2. Pros 2: Explanation of pros 2 
    3. Pros 3...
    4. etc...

    Cons:
    1. Hardcoded Values: Some values like API keys and file paths are hardcoded. It's recommended to use environment variables or configuration files to store such sensitive information to enhance maintainability.
    2. Commented-Out Code: There are commented-out sections of code (e.g., the second model initialization), which can clutter the codebase over time. Remove unused code or provide comments explaining why it's there.    
    3. Cons 3: Explanation of cons 3
    4. Cons 4...
    5. etc...

    *Readability:

    Pros:
    1. Descriptive Variable Names: Most variable names are descriptive, making it clear what each variable represents.
    2. Structured Code: The code is well-structured with proper indentation, making it easy to read and understand.
    3. Pros 3: Explanation of pros 3
    4. Pros 4...
    5. etc...

    Cons:
    1. Hardcoded Values: As mentioned earlier, the presence of hardcoded values can make the code less readable.
    2. Complex Logic: The loop that processes generated CVs and interacts with the model can be complex and may benefit from additional comments to clarify the intent of the code.
    3. Cons 3: Explanation of cons 3
    4. Cons 4...
    5. etc...

    *Scalability:

    Pros:
    1. Modular Approach: The code is divided into modular components, which can help with scalability as new features or improvements can be added to individual modules without affecting the entire codebase.
    2. Pros 2: Explanation of pros 2
    3. Pros 3...
    4. etc...

    Cons:
    1. Single Model Usage: The code is currently set up to use a single model. If future scalability requires the addition of more models or customization, the code may need to be refactored to accommodate this.
    2. Lack of Configuration Management: The code lacks a central configuration management approach, making it less flexible for scaling or deploying across different environments.
    3. Cons 3: Explanation of cons 3
    4. Cons 4...
    5. etc...

    *Summary of the review above
    `)
  });
  const res = await chain.call({
    input_documents: documents,
  });
  console.log({ res });
}

async function formatTheAllSummaryToJSON() {
  const exampleData = "\n\n*Maintainability:\n\nPros:\n1. Modular Code: The code is organized into separate modules and follows good separation of concerns, making it easier to maintain.\n2. Descriptive Variable Names: Most variable names are descriptive, making it clear what each variable represents.\n3. Structured Code: The code is well-structured with proper indentation, making it easy to read and understand.\n\nCons:\n1. Hardcoded Values: Some values like API keys and file paths are hardcoded. It's recommended to use environment variables or configuration files to store such sensitive information to enhance maintainability.\n2. Commented-Out Code: There are commented-out sections of code (e.g., the second model initialization), which can clutter the codebase over time. Remove unused code or provide comments explaining why it's there.\n3. Lack of Configuration Management: The code lacks a central configuration management approach, making it less flexible for scaling or deploying across different environments.\n\n*Readability:\n\nPros:\n1. Descriptive Variable Names: Most variable names are descriptive, making it clear what each variable represents.\n2. Structured Code: The code is well-structured with proper indentation, making it easy to read and understand.\n\nCons:\n1. Hardcoded Values: As mentioned earlier, the presence of hardcoded values can make the code less readable.\n2. Complex Logic: The loop that processes generated CVs and interacts with the model can be complex and may benefit from additional comments to clarify the intent of the code.\n\n*Scalability:\n\nPros:\n1. Modular Approach: The code is divided into modular components, which can help with scalability as new features or improvements can be added to individual modules without affecting the entire codebase.\n\nCons:\n1. Single Model Usage: The code is currently set up to use a single model. If future scalability requires the addition of more models or customization, the code may need to be refactored to accommodate this.\n2. Lack of Configuration Management: The code lacks a central configuration management approach, making it less flexible for scaling or deploying across different environments.\n\n*Summary of the review above:\n\nThe code demonstrates good maintainability with its modular structure and descriptive variable names. However, the presence of hardcoded values and commented-out code can hinder maintainability. The code is generally readable, but the complex logic could benefit from additional comments. In terms of scalability, the modular approach is a strength, but the code's reliance on a single model and lack of configuration management are potential limitations.\n\nOverall Score: 75"

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

    const chainResponse = await chain.invoke({      
      format_instructions: parser.getFormatInstructions(),
      data: exampleData,
    })

    const response: ReviewData = {
      maintainability: chainResponse.maintainability,
      readability: chainResponse.readability,
      scalability: chainResponse.scalability,
      summary: chainResponse.summary,
      score: chainResponse.score
    }

    console.log("*Maintanability\n");
    console.log("\nPros\n");
    (response.maintainability.pros || []).forEach((element, index) => {
      console.log(`${index + 1}. ${element.title || ""} ==> ${element.explanation || ""}`)
    })

    console.log("\nCons\n");
    (response.maintainability.cons || []).forEach((element, index) => {
      console.log(`${index + 1}. ${element.title || ""} ==> ${element.explanation || ""}`)
    })

    console.log("\n*Readability\n");
    console.log("\nPros\n");
    (response.readability.pros || []).forEach((element, index) => {
      console.log(`${index + 1}. ${element.title || ""} ==> ${element.explanation || ""}`)
    })

    console.log("\nCons\n");
    (response.readability.cons || []).forEach((element, index) => {
      console.log(`${index + 1}. ${element.title || ""} ==> ${element.explanation || ""}`)
    })

    console.log("\n*Scalability\n");
    console.log("\nPros\n");
    (response.scalability.pros || []).forEach((element, index) => {
      console.log(`${index + 1}. ${element.title || ""} ==> ${element.explanation || ""}`)
    })

    console.log("\nCons\n");
    (response.scalability.cons || []).forEach((element, index) => {
      console.log(`${index + 1}. ${element.title || ""} ==> ${element.explanation || ""}`)
    })
}

formatTheAllSummaryToJSON()

// cloneAndListFiles()
