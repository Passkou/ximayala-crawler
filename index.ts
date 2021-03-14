import axios from 'axios';
import * as fs from 'fs';
import * as https from 'https';
import * as jsdom from 'jsdom';
import * as path from 'path';

/**
 * 参数设置开始
 */

// 音频列表 URL，不要有 / 后缀
const listUrl: string = 'https://www.ximalaya.com/waiyu/14359664';

/**
 * 参数设置结束 
 */


const session = axios.create({
    httpsAgent: new https.Agent({keepAlive: true}),
    headers: {
        "Referer": "https://www.ximalaya.com/",
        "User-Agent": "Mozilla/5.0"
    }
});

/**
 * 获取音频下载地址
 * @param audioId 音频 ID
 */
async function getAudioURL(audioId: number): Promise<string> {
    const resp = await session.get('https://www.ximalaya.com/revision/play/v1/audio', {
        params: {
            id: audioId,
            ptype: 1
        },
        responseType: 'json'
    });
    const data = resp.data;
    if (data.ret === 200) {
        return data.data.src;
    } else {
        throw new Error('出现错误：' + JSON.stringify(data));
    }
}

interface Audio {
    name: string
    id: number
}

/**
 * 获取音频 ID 列表
 * @param url 列表 URL
 */
async function getAudioIdList(url: string): Promise<Audio[]> {
    
    const audios: Audio[] = [];
    let nowPage: number = 1;
    while (true) {
        console.log(`正在拉取第 ${nowPage} 页音频 ID`)
        const resp = await session.get(url + `/p${nowPage++}/`, {
            responseType: 'text'
        });
        const dom = new jsdom.JSDOM(resp.data);
        const document = dom.window.document;
        const items = document.querySelectorAll<HTMLAnchorElement>('.sound-list > ul > li a');
        items.forEach(e => {
            const id = parseInt(e.href.split('/').pop());
            const name = e.title;
            audios.push({
                name, id
            });
        });
        if (document.querySelector('.page-next') === null) {
            break;
        }
    }
    return audios;
}

/**
 * 下载音频并保存
 * @param audio 音频信息
 * @param pathToSave 保存路径
 */
function downloadAudio(audio: Audio, pathToSave: string): Promise<void> {
    let filename: string = '';
    return getAudioURL(audio.id).then(url => {
        console.log('下载音频：', audio.name);
        const ext: string = path.extname(url.split('/').pop());
        filename = audio.name + ext;
        return session.get(url, {
            responseType: 'stream'
        });
    }).then(resp => {
        console.log('保存音频：', audio.name);
        return new Promise((resolve) => {
            const f = fs.createWriteStream(path.join(pathToSave, `${audio.id}-${filename}`));
            resp.data.pipe(f);
            f.on('finish', resolve)
        })
    });
}

(async () => {
    if (!fs.existsSync('./result')) {
        await fs.promises.mkdir('./result');
    }
    const audioListId: string = listUrl.split('/').pop();
    const pathToSave: string = path.join('./result', audioListId);
    if (!fs.existsSync(pathToSave)) {
        await fs.promises.mkdir(pathToSave);
    } 
    const audio = await getAudioIdList(listUrl);
    const tasks: Promise<void>[] = audio.map(v => {
        return downloadAudio(v, pathToSave);
    });
    await Promise.all(tasks);
    console.log('音频已保存至：', path.resolve(pathToSave));
})();