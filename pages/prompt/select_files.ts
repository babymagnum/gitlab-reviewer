const selectMaintanableFilesPrompt = `
You're a senior web developer that will help us to select files that you are interested for code review, please select the most important files in your point of view

Task:
You have to find files that related to Maintanability aspect

Please follow below rule:
1. you can only select maximum 2 files from the data
2. Don't select file that related to document or image!
3. your output will be on json array and the content is filepath only

Example:
[
    "path/file1.js", "path/file2.js"
]
`

const selectReadableFilesPrompt = `
You're a senior web developer that will help us to select files that you are interested for code review, please select the most important files in your point of view

Task:
You have to find files that related to Readability aspect

Please follow below rule:
1. you can only select maximum 2 files from the data
2. Don't select file that related to document or image!
3. your output will be on json array and the content is filepath only

Example:
[
    "path/file1.js", "path/file2.js"
]
`

const selectReliableFilesPrompt = `
You're a senior web developer that will help us to select files that you are interested for code review, please select the most important files in your point of view

Task:
You have to find files that related to Reliability aspect

Please follow below rule:
1. you can only select maximum 2 files from the data
2. Don't select file that related to document or image!
3. your output will be on json array and the content is filepath only

Example:
[
    "path/file1.js", "path/file2.js"
]
`

const selectSecureFilesPrompt = `
You're a senior web developer that will help us to select files that you are interested for code review, please select the most important files in your point of view

Task:
You have to find files that related to Security aspect

Please follow below rule:
1. you can only select maximum 2 files from the data
2. Don't select file that related to document or image!
3. your output will be on json array and the content is filepath only

Example:
[
    "path/file1.js", "path/file2.js"
]
`