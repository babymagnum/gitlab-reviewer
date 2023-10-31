import Head from 'next/head';
import { useState } from 'react';
import { GitlabReviewResponseV2 } from './interface/gitlab_response';
import { StateEnum } from './interface/file_item';

export default function Home() {
  const [urlInput, setUrlInput] = useState<string>("https://github.com/babymagnum/langchain_example");
  const [state, setState] = useState<StateEnum>(StateEnum.IDLE);
  const [result, setResult] = useState<GitlabReviewResponseV2>();

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
        <div>
          <input
            style={{ width: '100%' }}
            type="text"
            name="text-url"
            placeholder="Masukan url git repo"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
          />
          {/* <br></br>
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
          }`1a */}
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
                    <h1>This is the raw summary</h1>
                    <h3>Final Score: {result.resultFinal?.finalScore}</h3>
                    {result.resultFinal?.rawReviews.map(element => {
                      return <text style={{ whiteSpace: 'pre-line' }}>{element}</text>
                    })}
                  </div>
          }
        </div>
      </main>
    </div>
  );
}
