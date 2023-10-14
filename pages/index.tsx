import Head from 'next/head';
import styles from '../styles/Home.module.css';
import Link from 'next/link';
import { useState } from 'react';
import { GitlabReviewResponse, ReviewData } from './interface/gitlab_response';

enum StateEnum {
  IDLE, LOADING, SUCCESS, ERROR
}

export default function Home() {
  const [urlInput, setUrlInput] = useState<string>("");
  const [state, setState] = useState<StateEnum>(StateEnum.IDLE);
  const [result, setResult] = useState<GitlabReviewResponse>();

  async function doReview() {
    try {
      setState(StateEnum.LOADING);
      const response = await fetch("/api/api_gitlab_review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: urlInput,
        }),
      });
      setState(response.status === 200 ? StateEnum.SUCCESS : StateEnum.ERROR);

      const data: GitlabReviewResponse = await response.json();

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

        <form>
          <input
            type="text"
            name="text-url"
            placeholder="Masukan url git repo"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
          />
        </form>

        <div>
          <button style={{ marginTop: 10 }} onClick={() => doReview()}>Review</button>

          {
            state === StateEnum.IDLE ?
            <view></view> :
            state === StateEnum.LOADING ? 
            <text>{"Loading..."}</text> :
            state === StateEnum.ERROR ?
            <text>{result.message || "Error!"}</text> :
            // state SUCCESS
            <div>
              {/* Maintanability section */}
              <h2>Maintanability</h2>
              <h3>Pros</h3>
              <ul>
                {(result.result?.maintainability?.pros || []).map(element => {
                  return <li>{`${element.title || ""} ==> ${element.explanation || ""}`}</li>
                })}
              </ul>
              <h3>Cons</h3>
              <ul>
                {(result.result?.maintainability?.cons || []).map(element => {
                  return <li>{`${element.title || ""} ==> ${element.explanation || ""}`}</li>
                })}
              </ul>
              {/* Readability section */}
              <h2>Readability</h2>              
              <h3>Pros</h3>
              <ul>
                {(result.result?.readability?.pros || []).map(element => {
                  return <li>{`${element.title || ""} ==> ${element.explanation || ""}`}</li>
                })}
              </ul>
              <h3>Cons</h3>
              <ul>
                {(result.result?.readability?.cons || []).map(element => {
                  return <li>{`${element.title || ""} ==> ${element.explanation || ""}`}</li>
                })}
              </ul>
              {/* Scalability section */}
              <h2>Scalability</h2>
              <h3>Pros</h3>
              <ul>
                {(result.result?.scalability?.pros || []).map(element => {
                  return <li>{`${element.title || ""} ==> ${element.explanation || ""}`}</li>
                })}
              </ul>
              <h3>Cons</h3>
              <ul>
                {(result.result?.scalability?.cons || []).map(element => {
                  return <li>{`${element.title || ""} ==> ${element.explanation || ""}`}</li>
                })}
              </ul>
              <h3>Summary</h3>
              <p>{result.result?.summary || ""}</p>
              <h3>Score: {`${result.result?.score || 0}`}</h3>
            </div>
          }

          
        </div>
      </main>
    </div>
  );
}
