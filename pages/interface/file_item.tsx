export enum StateEnum {
    IDLE, LOADING, SUCCESS, ERROR
}

export class FileItem {
    filePath: string
    review: string
    state: StateEnum = StateEnum.IDLE

    constructor(filePath: string, review: string, state: StateEnum) {
        this.filePath = filePath
        this.review = review
        this.state = state
    }
}