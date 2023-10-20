export interface GitlabReviewResponse {
    result?: ReviewData,
    message?: string
}

export interface GitlabReviewResponseV2 {
    result?: string,
    message?: string,
    resultArray?: string[],
    resultFinal?: FinalResultItem[]
}

export interface ReviewData {
    maintainability?: SectionData
    readability?: SectionData
    scalability?: SectionData
    summary?: string
    score?: number
}

export interface SectionData {
    pros?: ItemReview[],
    cons?: ItemReview[]
}

export interface ItemReview {
    title?: string,
    explanation?: string
}