import { FileItem } from "../../interface/file_item";

export interface AllFilesResponse {
    result?: FileItem[]
    message?: string
    cloneDirectory: string
}