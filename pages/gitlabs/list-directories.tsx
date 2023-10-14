import axios from 'axios'
import { useState } from 'react';
import { NextPageContext } from 'next'

interface DirectoryItem {
    id: number
    name: string
}

Directories.getInitialProps = async (ctx: NextPageContext) => {
    return {
        id: 995
    }
}

export default function Directories({ testCustom }) {
    const baseUrl = 'https://gitlab.skyshi.io/api/v4'
    const privateAccessToken = 'HYu-hvifWLwcryry1oix'

    const [directories, setDirectories] = useState<DirectoryItem[]>([]);

    async function fetchDirectories() {
        const res = await axios.get(`${baseUrl}/projects/995/repository/tree`)

        // let repositories: RepositoriesModel[] = res.data.map((element: any) => new RepositoriesModel(element.id, element.name))
        let directories: DirectoryItem[] = res.data.map((element: any) => {
            return {
                id: element.id,
                name: element.name
            } as DirectoryItem;
        })

        setDirectories((prevList) => [...prevList, ...directories])
    }

    return (
        <div>
            <div>{`this is the id ==> ${testCustom.id}`}</div>
            <button onClick={async () => fetchDirectories()}>click to fetch repositories</button>
            {
                directories.map((element) => {
                    return <div style={{ marginTop: 10 }}>{`${element.name} => ${element.id}`}</div>
                })
            }
        </div>
    );
}