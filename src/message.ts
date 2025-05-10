import YunhuBot from './'
import { decodeMessage } from './utils'
import * as Yunhu from './types'
import { Context, h, Dict, MessageEncoder } from 'koishi'
export class YunhuMessageEncoder<C extends Context> extends MessageEncoder<C, YunhuBot<C>> {
    // 使用 payload 存储待发送的消息
    private payload: Dict

    // 在 prepare 中初始化 payload
    async prepare() {
        let [recvId, recvType] = this.channelId.split(':');
        this.payload = {
            recvId,
            recvType,
            contentType: 'text',
            content: {
                text: ''
            }
        }
    }

    // 将发送好的消息添加到 results 中
    async addResult(data: any) {
        const message = data
        this.results.push(message)
        const session = this.bot.session()
        session.event.message = message
        session.app.emit(session, 'send', session)
    }

    // 发送缓冲区内的消息
    async flush() {
        let message: Yunhu.Message
        if (this.payload.content.text) {
            message = await this.bot.internal.sendMessage(this.payload)
        }
        await this.addResult(message)
        this.payload.content.text = ''
    }

    // 遍历消息元素
    async visit(element: h) {
        const { type, attrs, children } = element
        if (type === 'text') {
            this.payload.content.text += h.escape(attrs.content)
            this.payload.contentType = 'text'
        } else if (type === 'img' || type === 'image') {
            const imgkey = await this.bot.internal.uploadImage(attrs.src)
            this.payload.content.imageKey = imgkey
            this.payload.contentType = 'image'
        } else {
            await this.render(children)
        }
    }
}