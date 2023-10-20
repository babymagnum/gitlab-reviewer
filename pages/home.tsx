import Head from 'next/head';
import styles from '../styles/Home.module.css';
import { useEffect, useState } from 'react';
import { FileItem, StateEnum } from './interface/file_item';
import { getAllFiles, getFileContent } from './controller/git_reviewer_controller';

export default function Home() {
  const [urlInput, setUrlInput] = useState<string>("https://github.com/babymagnum/langchain_example")
  const [parameterInput, setParameterInput] = useState<string>("maintanability, readability")
  const [outputInput, setOutputInput] = useState<string>("explanation of each item")
  const [filteredFiles, setFilteredFiles] = useState<FileItem[]>([])
  const [initialState, setInitialState] = useState<StateEnum>(StateEnum.IDLE)
  const [cloneDirectory, setCloneDirectory] = useState<string>("")

  useEffect(() => {
    if (filteredFiles.length > 0 && filteredFiles.some(e => e.state !== StateEnum.LOADING) && cloneDirectory !== "") {
      getFilesContent()
    }
  }, [filteredFiles, cloneDirectory]);

  async function _getAllFiles() {
    try {
      setInitialState(StateEnum.LOADING)
      const data = await getAllFiles(urlInput, parameterInput, outputInput)
      setInitialState(data === null ? StateEnum.ERROR : StateEnum.SUCCESS)

      // set the result
      setFilteredFiles((value) => [...value, ...data.result || []])
      setCloneDirectory(data.cloneDirectory || '')
    } catch (error) {
      setInitialState(StateEnum.ERROR)

      alert(error.message);
    }
  }

  function updateFilesContent(file: FileItem, i: number) {
    let newFilteredFiles = filteredFiles
    file.state = StateEnum.LOADING
    newFilteredFiles[i] = file
    setFilteredFiles([...newFilteredFiles])
  }

  async function getFilesContent() {
    for await (const [i, file] of filteredFiles.entries()) {
      file.state = StateEnum.LOADING
      updateFilesContent(file, i)

      const data = await getFileContent(parameterInput, outputInput, cloneDirectory, file)

      file.state = data == null ? StateEnum.ERROR : StateEnum.SUCCESS
      file.review = data.review
      updateFilesContent(file, i)
    }
  }

  return (
    <div>
      <Head>
        <title>Git Reviewer</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main>
        <h1 className={styles.title}>
          Welcome to Git Reviewer!
        </h1>

        <div>

          <input
            style={{ width: '40%' }}
            type="text"
            name="text-url"
            placeholder="Masukan url git repo"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
          />
          <br></br>
          <input
            style={{ width: '40%', marginTop: 10 }}
            type="text"
            name="text-parameter"
            placeholder="Masukan parameter code review"
            value={parameterInput}
            onChange={(e) => setParameterInput(e.target.value)}
          />
          <br></br>
          <input
            style={{ width: '40%', marginTop: 10 }}
            type="text"
            name="text-output"
            placeholder="Masukan output code review"
            value={outputInput}
            onChange={(e) => setOutputInput(e.target.value)}
          />
          <br></br>
          <button style={{ marginTop: 10, width: '40%' }} onClick={() => _getAllFiles()}>Review</button>
          <br></br>
          {
            initialState === StateEnum.IDLE ?
              <view></view> :
              initialState === StateEnum.LOADING ?
                <text style={{ marginTop: 10 }}>{"Loading..."}</text> :
                initialState === StateEnum.ERROR ?
                  <div>
                    <text style={{ marginTop: 10 }}>Gagal melakukan git clone</text>
                    <br></br>
                    <button onClick={() => _getAllFiles()}>Retry</button>
                  </div> :
                  // state SUCCESS
                  <div>
                    {filteredFiles.map(element => <div style={{ backgroundColor: 'grey', padding: 10, marginTop: 10, borderRadius: 10 }}>
                      <text style={{ color: 'white' }}>{`File ==> ${element.filePath}`}</text>
                      <br></br>
                      {
                      element.state === StateEnum.LOADING ? 
                      <text style={{color: 'white'}}>Loading...</text> :
                      element.state === StateEnum.ERROR ?
                      <button onClick={() => console.log('tes tap retry per item')}>Tap to retry</button> :
                      <text style={{color: 'white'}}>{element.review || ''}</text>
                      }
                    </div>)}
                  </div>
          }
        </div>
      </main>
    </div>
  );
}
