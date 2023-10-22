import Head from 'next/head';
import styles from '../styles/Home.module.css';
import { useEffect, useState } from 'react';
import { GitlabReviewResponseV2 } from './interface/gitlab_response';

enum StateEnum {
  IDLE, LOADING, SUCCESS, ERROR
}

export default function Home() {
  const [urlInput, setUrlInput] = useState<string>("https://github.com/babymagnum/langchain_example");
  const [state, setState] = useState<StateEnum>(StateEnum.IDLE);
  const [result, setResult] = useState<GitlabReviewResponseV2>();
  const [inputList, setInputList] = useState<string[]>([]);

  useEffect(() => {
    
  }, [inputList])

  async function doReview() {
    try {
      setState(StateEnum.LOADING);
      const response = await fetch("/api/api_gitlab_review_v2", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: urlInput,
          custom_parameter: inputList,
        }),
      });
      setState(response.status === 200 ? StateEnum.SUCCESS : StateEnum.ERROR);

      const data: GitlabReviewResponseV2 = await response.json();

      if (response.status !== 200) {
        alert(data.message || 'error!');
        return;
      }

      // set the result
      setResult(data);
    } catch (error) {
      // Consider implementing your own error handling logic here
      alert(error.message);
    }
  }

  return (
    <div>
      <Head>
        <title>Create Next App</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main>
        <h1 className={styles.title}>
          Welcome to Git Reviewer!
        </h1>

        <div>

          <input
            style={{ width: '100%' }}
            type="text"
            name="text-url"
            placeholder="Masukan url git repo"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
          />
          <br></br>
          {
            inputList.map((element, index) => {
              return <input
                style={{ width: '100%', marginTop: 10 }}
                type="text"
                name="text-parameter"
                placeholder="Masukan parameter code review"
                value={element}
                onChange={(e) => {
                  element = e.target.value
                  inputList[index] = element
                  setInputList([...inputList])
                }}
              />
            })
          }
          <br></br>
          <button style={{ marginTop: 10 }} onClick={() => {
            setInputList((_value) => [..._value, ''])
          }}>Add parameter</button>
          <br></br>
          <button style={{ marginTop: 10 }} onClick={() => doReview()}>Review</button>
          <br></br>
          {
            state === StateEnum.IDLE ?
              <view></view> :
              state === StateEnum.LOADING ?
                <text style={{ marginTop: 10 }}>{"Loading..."}</text> :
                state === StateEnum.ERROR ?
                  <text style={{ marginTop: 10 }}>{result?.message || "Error!"}</text> :
                  <div>
                    <h1>This is the summary</h1>
                    {
                      (result.resultFinal || []).map(element => {
                        return <div>
                          <h2>*{element.parameter}</h2>
                          <h3>Positive:</h3>
                          <p style={{whiteSpace: 'pre-line'}}>{element.summaryPositive}</p>
                          {/* {element.positive.map((positive, index) => <div>
                            <p>{`${index + 1}. ${positive}`}</p>
                          </div>)} */}
                          <h3>Negative:</h3>
                          <p style={{whiteSpace: 'pre-line'}}>{element.summaryNegative}</p>
                          {/* {element.negative.map((negative, index) => <div>
                            <p>{`${index + 1}. ${negative}`}</p>
                          </div>)} */}
                        </div>
                      })
                    }
                    <br></br>
                    <br></br>
                    {
                      (result.resultArray || []).map((element, index) => {
                        return <div style={{ marginTop: 10, backgroundColor: 'grey', borderRadius: 10, padding: 10 }}>
                          <text style={{ color: 'white', whiteSpace: 'pre-line' }}>{element}</text>
                          <br></br>
                        </div>
                      })
                    }
                  </div>
            // <text style={{ whiteSpace: 'pre-line' }}>{result?.result || ''}</text>
            // state SUCCESS
            // <div>
            //   {/* Maintanability section */}
            //   <h2>Maintanability</h2>
            //   <h3>Pros</h3>
            //   <ul>
            //     {(result.result?.maintainability?.pros || []).map(element => {
            //       return <li>{`${element.title || ""} ==> ${element.explanation || ""}`}</li>
            //     })}
            //   </ul>
            //   <h3>Cons</h3>
            //   <ul>
            //     {(result.result?.maintainability?.cons || []).map(element => {
            //       return <li>{`${element.title || ""} ==> ${element.explanation || ""}`}</li>
            //     })}
            //   </ul>
            //   {/* Readability section */}
            //   <h2>Readability</h2>
            //   <h3>Pros</h3>
            //   <ul>
            //     {(result.result?.readability?.pros || []).map(element => {
            //       return <li>{`${element.title || ""} ==> ${element.explanation || ""}`}</li>
            //     })}
            //   </ul>
            //   <h3>Cons</h3>
            //   <ul>
            //     {(result.result?.readability?.cons || []).map(element => {
            //       return <li>{`${element.title || ""} ==> ${element.explanation || ""}`}</li>
            //     })}
            //   </ul>
            //   {/* Scalability section */}
            //   <h2>Scalability</h2>
            //   <h3>Pros</h3>
            //   <ul>
            //     {(result.result?.scalability?.pros || []).map(element => {
            //       return <li>{`${element.title || ""} ==> ${element.explanation || ""}`}</li>
            //     })}
            //   </ul>
            //   <h3>Cons</h3>
            //   <ul>
            //     {(result.result?.scalability?.cons || []).map(element => {
            //       return <li>{`${element.title || ""} ==> ${element.explanation || ""}`}</li>
            //     })}
            //   </ul>
            //   <h3>Summary</h3>
            //   <p>{result.result?.summary || ""}</p>
            //   <h3>Score: {`${result.result?.score || 0}`}</h3>
            // </div>
          }


        </div>
      </main>
    </div>
  );
}
