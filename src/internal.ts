import { Context, h, HTTP, Dict, Logger } from 'koishi'
import YunhuBot from './'
import * as Yunhu from './types'
import { FormData, File } from 'formdata-node'
import { fileFromPath } from 'formdata-node/file-from-path'
import { Blob } from 'buffer'
import fs from 'fs'
import path from 'path'

const logger = new Logger('yunhu')
export default class Internal {
    constructor(private http: HTTP, private token: string) { }
    sendMessage(payload: Dict) {
        return this.http.post(`/bot/send?token=${this.token}`, payload)
    }


    async uploadImage(image: string | Buffer): Promise<string> {
        const form = new FormData()
       // logger.info(image)

        if (Buffer.isBuffer(image)) {
            // 是 Buffer，直接用 Blob 包装
            const blob = new Blob([image], { type: 'image/png' })
            form.append('image', blob, 'image.png')
        } else if (typeof image === 'string') {
            if (image.startsWith('data:image/')) {
                // 是 base64 字符串
                const base64Data = image.split(',')[1]
                const buffer = Buffer.from(base64Data, 'base64')
                const blob = new Blob([buffer], { type: 'image/png' })
                form.append('image', blob, 'image.png')
            } else {
                // 默认当成路径（你别传相对路径骗我）
                const file = await fileFromPath(path.resolve(image))
                form.append('image', file)
            }
        } else {
            throw new Error('上传图片只支持路径、base64 或 Buffer 哦～')
        }

        const response = await this.http.post(`/image/upload?token=${this.token}`, form)
        if (response.code !== 0) {
            throw new Error(`图片上传失败：${response.msg}`)
        }
        return response.data.imageKey
    }
}