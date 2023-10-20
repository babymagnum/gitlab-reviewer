import { AllFilesResponse } from "../api/responses/get_all_files_response";
import { FileContentResponse } from "../api/responses/get_file_content_response";
import { FileItem } from "../interface/file_item";

export async function getAllFiles(urlInput: string, parameterInput: string, outputInput: string): Promise<AllFilesResponse> {
    const response = await fetch("/api/services/get_all_files", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            url: urlInput,
            custom_parameter: parameterInput,
            custom_output: outputInput
        }),
    })

    const data: AllFilesResponse = await response.json()

    if (response.status !== 200) {
        alert(data.message || 'error!')
        return null
    }

    return data
}

export async function getFileContent(customParameter: string, customOutput: string, cloneDirectory: string, fileItem: FileItem): Promise<FileItem> {
    const response = await fetch("/api/services/get_file_content", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            custom_parameter: customParameter,
            custom_output: customOutput,
            clone_directory: cloneDirectory,
            file_item: fileItem
        }),
    })

    const data: FileContentResponse = await response.json()

    if (response.status !== 200) {
        console.log(`GAGAL GET REVIEW ==> ${data.message}`)
        return null
    }

    console.log(`SUKSES GET REVIEW ==> ${data.result.review}`)

    return data.result
}