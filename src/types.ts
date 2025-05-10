// types.ts
export interface YunhuConfig {
  token: string;
  endpoint?: string; // 可选，如果不是默认 endpoint 的话
  path?: string;     // 可选，云湖平台推送回调的路径
}

export interface YunhuMessage {
  recvId: string;
  recvType: 'user' | 'group';
  contentType: 'text' | 'image' | 'video' | 'file' | 'markdown' | 'html';
  content: {
    text?: string;      // for text/markdown/html
    imageKey?: string;  // for image
    fileKey?: string;   // for file
    videoKey?: string;   // for video
    // 其他类型的 content 字段
  };
  parentId?: string; // 回复消息ID
}

export interface Message {
  msgId: string
  parentId?: string
  sendTime: number // 毫秒级时间戳
  chatId: string
  chatType: 'group' | 'bot'
  contentType: 'text' | 'image' | 'markdown' | 'file'
  content: Content
  commandId?: number
  commandName?: string
}
export interface Content {
  text?: string          // contentType 为 text 或 markdown 时用
  imageKey?: string      // contentType 为 image 时用
  fileKey?: string       // contentType 为 file 时用
  videoKey?: string      // contentType 为 video 时用
  buttons?: Button[]     // 所有类型都可能有
}
export interface Button {
  text: string
  actionType: 1 | 2 | 3
  url?: string
  value?: string
}
export interface YunhuEvent {
    version: string;
    header: {
        eventId: string;
        eventTime: number;
        eventType: string;
    };
    event: Event; // 根据事件类型定义更详细的结构
}
export interface Sender {
  senderId: string
  senderType: 'user'
  senderUserLevel: 'owner' | 'administrator' | 'member' | 'unknown'
  senderNickname: string
}

export interface Event {
  sender: Sender
  message: Message
  chat: Chat
}

export interface Chat {
  chatId: string
  chatType: 'bot' | 'group'
}

export interface YunhuResponse {
  code: number;
  msg: string;
  data?: any;
}

export interface Internal {
  token: string;
  endpoint: string;
}