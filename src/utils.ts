// src/utils.ts
import { Bot, Context, h, Session, Universal } from 'koishi'
import * as Yunhu from './types'
import YunhuBot from './'

// TODO: 实现 decodeUser, decodeChannel, decodeGuild 等函数
//       根据云湖平台的数据结构，将平台特有的 User, Channel, Guild 对象
//       转换为 Koishi 的 Universal 格式。如果某些信息无法获取，可以留空。

// 示例：
export const decodeUser = (user: any): Universal.User => ({
  id: user.senderId,  // 假设 senderId 是用户 ID
  name: user.senderNickname, // 假设 senderNickname 是用户名
  // isBot: user.isBot,  // 云湖平台是否有 isBot 字段？
  // avatar: user.avatar, // 云湖平台是否有头像 URL？
})

export const decodeMessage = (message: Yunhu.Message): Universal.Message => ({

})

function transformElements(elements: any[]) {
  return elements.map(element => {
    if (typeof element === 'string') {
      return h.text(element)
    }
    // else if (element instanceof Buffer) {
    // 	return h.image(element)
    // }
    else {
      return h.text(String(element))
    }
  })
}

export function adaptSession<C extends Context = Context>(bot: YunhuBot<C>, input: Yunhu.YunhuEvent) {
  const session = bot.session()

  session.setInternal(bot.platform, input)

  switch (input.header.eventType) {
    case 'message.receive.normal':
    case 'message.receive.instruction': {
      const { sender, message, chat } = input.event;
      session.type = 'message'
      session.userId = sender.senderId
      if (message.chatType === 'bot') {
        session.channelId = `${sender.senderId}:user`
      } else {
        session.channelId = `${message.chatId}:${message.chatType}` // 合并 channelId 和 chatType
      }
      session.content = message.content.text
      session.messageId = message.msgId
      session.timestamp = message.sendTime
      //session.guildId = session.channelId
      //session.channelName = chat.chatId // 这可能需要根据 chatType 进行处理

      // TODO: Yunhu的消息内容可能包含富文本、图片等，需要进行转换
      session.event.message = {
        id: message.msgId,
        content: message.content.text,
        elements: transformElements([message.content.text]), // 示例，需要根据实际情况调整
      }

      break;
    }
    case 'bot.followed':
      session.type = 'friend-added' // 或者其他合适的类型
      break;
    // TODO: 其他事件类型
    default:
      return // 忽略未知事件
  }

  return session
}