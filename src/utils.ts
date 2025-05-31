import { Bot, Context, h, Session, Universal, Logger } from 'koishi'
import * as Yunhu from './types'
import YunhuBot from './'

// 将云湖用户信息转换为Koishi通用用户格式
export const decodeUser = (user: Yunhu.Sender): Universal.User => ({
  id: user.senderId,
  name: user.senderNickname,
  // 云湖平台目前没有提供isBot和avatar字段
  isBot: false, // 默认为false，因为sender通常是人类用户
})

// 将云湖消息转换为Koishi通用消息格式
export const decodeMessage = (message: Yunhu.Message): Universal.Message => {
  const elements = []

  // 处理文本内容
  if (message.content.text) {
    elements.push(h.text(message.content.text))
  }

  // 处理图片内容
  if (message.content.imageKey) {
    // 这里可以构造一个图片URL或者使用imageKey作为标识
    elements.push(h.image(`yunhu:${message.content.imageKey}`))
  }

  // 处理文件内容
  if (message.content.fileKey) {
    // 可以添加文件元素或者转换为文本提示
    elements.push(h.text(`[文件]`))
  }

  // 处理视频内容
  if (message.content.videoKey) {
    // 可以添加视频元素或者转换为文本提示
    elements.push(h.text(`[视频]`))
  }

  if (message.content.at) {
    // elements.push(h.at(message.content.at))
    message.content.at.forEach(id => {
      elements.push(h.at(id))
    });
  }
  if (message.parentId) {
    elements.push(h.quote(message.parentId))
  }

  return {
    id: message.msgId,
    content: message.content.text || '',
    elements,
  }
}

// 将消息内容转换为Koishi消息元素
function transformElements(elements: any[]) {
  return elements.map(element => {
    if (typeof element === 'string') {
      return h.text(element)
    } else if (Buffer.isBuffer(element)) {
      // 正确的方式是将data和type作为独立参数传递
      return h.image(element, 'image/png')
    } else if (typeof element === 'object' && element.type === 'image') {
      // 处理已经是图片对象的情况
      if (element.url) {
        return h.image(element.url)
      } else if (element.data) {
        return h.image(element.data, 'image/png')
      }
    } else {
      return h.text(String(element))
    }
  })
}

// 适配会话，将云湖事件转换为Koishi会话
export function adaptSession<C extends Context = Context>(bot: YunhuBot<C>, input: Yunhu.YunhuEvent) {
  const session = bot.session()
  session.setInternal(bot.platform, input)

  switch (input.header.eventType) {
    // 消息事件处理
    case 'message.receive.normal':
    case 'message.receive.instruction': {
      const { sender, message, chat } = input.event as Yunhu.MessageEvent;
      session.type = 'message'
      session.userId = sender.senderId
      session.event.user.name = sender.senderNickname
      session.event.user.nick = sender.senderNickname

      // 设置频道ID，区分私聊和群聊
      if (message.chatType === 'bot') {
        session.channelId = `${sender.senderId}:user`
        session.isDirect = true
      } else {
        session.channelId = `${message.chatId}:${message.chatType}`
        session.guildId = message.chatId
        session.isDirect = false
      }

      // 设置消息内容和元数据
      session.content = message.content.text || ''
      session.messageId = message.msgId
      session.timestamp = message.sendTime
      // session.quote.id = message.parentId? message.parentId : undefined

      const logger = new Logger('yunhu')
      // logger.info(message)
      

      // 转换消息内容为Koishi格式
      session.event.message = decodeMessage(message)
      logger.info(session)
      break;
    }

    // 好友添加事件
    case 'bot.followed': {
      session.type = 'friend-added'
      const { sender } = input.event as Yunhu.MessageEvent;
      session.userId = sender.senderId
      session.event.user.name = sender.senderNickname
      break;
    }

    // 加群事件处理
    case 'group.member.joined': {
      const { sender, chat, joinedMember } = input.event as Yunhu.GroupMemberJoinedEvent;
      session.type = 'guild-member-added'
      session.userId = joinedMember.memberId
      session.event.user.name = joinedMember.memberNickname
      session.guildId = chat.chatId
      session.operatorId = sender.senderId
      break;
    }

    // 退群事件处理
    case 'group.member.leaved': {
      const { sender, chat, leavedMember, leaveType } = input.event as Yunhu.GroupMemberLeavedEvent;
      session.type = 'guild-member-removed'
      session.userId = leavedMember.memberId
      session.event.user.name = leavedMember.memberNickname
      session.guildId = chat.chatId
      session.operatorId = sender.senderId
      // 区分自己退出还是被踢出
      session.subtype = leaveType === 'self' ? 'leave' : 'kick'
      break;
    }

    // 成员被邀请加入群聊事件
    case 'group.member.invited': {
      const { sender, chat, invitedMember, inviter } = input.event as Yunhu.GroupMemberInvitedEvent;
      session.type = 'guild-member-added'
      session.userId = invitedMember.memberId
      session.event.user.name = invitedMember.memberNickname
      session.guildId = chat.chatId
      session.operatorId = inviter.inviterId
      session.subtype = 'invite'
      break;
    }

    // 成员被踢出群聊事件
    case 'group.member.kicked': {
      const { sender, chat, kickedMember, operator } = input.event as Yunhu.GroupMemberKickedEvent;
      session.type = 'guild-member-removed'
      session.userId = kickedMember.memberId
      session.event.user.name = kickedMember.memberNickname
      session.guildId = chat.chatId
      session.operatorId = operator.operatorId
      session.subtype = 'kick'
      break;
    }

    // 群聊被解散事件
    case 'group.disbanded': {
      const { sender, chat, operator } = input.event as Yunhu.GroupDisbandedEvent;
      session.type = 'guild-deleted'
      session.guildId = chat.chatId
      session.operatorId = operator.operatorId
      break;
    }

    // 未知事件类型
    default:
      bot.logger.debug(`未处理的事件类型: ${input.header.eventType}`)
      return // 忽略未知事件
  }

  return session
}