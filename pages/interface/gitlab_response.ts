import { OverallReviewItem } from "./overall_review_item"

export interface GitlabReviewResponseV2 {
    message?: string
    resultFinal?: OverallReviewItem[]
    finalScore?: number
}