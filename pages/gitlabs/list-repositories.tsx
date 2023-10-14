import axios from 'axios'
import { useState } from 'react';
import { redirect } from 'next/navigation';

interface RepositoriesInterface {
    id: number
    name: string
}

export default function FirstPost() {
    const baseUrl = 'https://gitlab.skyshi.io/api/v4'
    const privateAccessToken = 'HYu-hvifWLwcryry1oix'

    const [repoList, setRepoList] = useState<RepositoriesInterface[]>([]);

    async function fetchRepositories() {
        const res = await axios.get(`${baseUrl}/projects?private_token=${privateAccessToken}&per_page=20&page=1`)

        // let repositories: RepositoriesModel[] = res.data.map((element: any) => new RepositoriesModel(element.id, element.name))
        let repositories: RepositoriesInterface[] = res.data.map((element: any) => {
            return {
                id: element.id,
                name: element.name
            } as RepositoriesInterface;
        })

        setRepoList((prevList) => [...prevList, ...repositories])
    }

    function showContent(data: RepositoriesInterface) {
        console.log(data)
    }

    return (
        <div>
            <button onClick={async () => fetchRepositories()}>click to fetch repositories</button>
            {
                repoList.map((element) => {
                    return <div onClick={() => showContent(element)} style={{ marginTop: 10 }}>{`${element.name} => ${element.id}`}</div>
                })
            }
        </div>
    );
}