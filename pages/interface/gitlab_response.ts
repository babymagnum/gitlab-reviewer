export interface FinalResultItem {  
    rawReviews: string[],
    finalScore: number
}

export interface GitlabReviewResponseV2 {
    message?: string
    resultFinal?: FinalResultItem
}