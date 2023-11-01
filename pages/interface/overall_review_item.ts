export interface OverallReviewItem {
    reviews: ReviewItem[]
    summary: string
    score: number
    subject: string
}

export interface ReviewItem {
    keyword?: string
    reviewStatus?: string
    filepath?: string
    proofOfEvidence?: string    
    score?: number
}