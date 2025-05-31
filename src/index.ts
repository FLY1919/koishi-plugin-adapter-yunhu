// src/index.ts
import { Adapter, Context, Logger, Bot, SessionError, h, Schema, Universal, Binary } from 'koishi'
import * as Yunhu from './types'  // 使用 * as Yunhu 引入
import { adaptSession } from './utils'
import { } from '@koishijs/plugin-server'
import { Blob } from 'node:buffer' // 确保安装 node:buffer
import Internal from './internal'
import { YunhuMessageEncoder } from './message'

const logger = new Logger('yunhu')

// 默认的云湖 API 地址
const YUNHU_ENDPOINT = 'https://chat-go.jwzhd.com'
const YUNHU_API_PATH = '/open-apis/v1'


export const name = 'yunhu'  // 插件名称

class YunhuBot<C extends Context = Context> extends Bot<C> {

  static inject = ['server']
  static MessageEncoder = YunhuMessageEncoder
  constructor(ctx: C, config: YunhuBot.Config) {
    super(ctx, config)
    this.platform = 'yunhu'
    this.selfId = config.token
    const http = ctx.http.extend({
      endpoint: `${this.config.endpoint}${YUNHU_API_PATH}`,
    })
    this.internal = new Internal(http, config.token, `${this.config.endpoint}${YUNHU_API_PATH}`)
    ctx.plugin(YunhuServer, this)
  }
}

export class YunhuServer<C extends Context> extends Adapter<C, YunhuBot<C>> {
  async connect(bot: YunhuBot) {
    await this.initialize(bot)
    this.ctx.on('send', (session) => {
      logger.info(session)
      logger.info(`New message: ${session.messageId} in channel: ${session.channelId}`);    })

    bot.ctx.server.post(bot.config.path, async (ctx) => {
      ctx.status = 200
      const payload: Yunhu.YunhuEvent = ctx.request.body

      if (bot.status !== Universal.Status.ONLINE) {
        await this.initialize(bot)
      }

      const session = adaptSession(bot, payload)  //使用adaptSession
      if (session) bot.dispatch(session)
      ctx.body = 'OK';  //云湖需要返回什么？
    })
  }

  async initialize(bot: YunhuBot) {
    try {
      bot.online()
    } catch (e) {
      bot.logger.warn(e)
      bot.offline()
    }
  }
}

// 插件的主要逻辑
/*
export function apply(ctx: Context, config: Config) {
  ctx.plugin(YunhuServer, config)
  ctx.plugin(Adapter, {
    platform: 'yunhu',
    Bot: YunhuBot,
    config,
  })

  let bot: YunhuBot;
  ctx.on('ready', async () => {
    bot = ctx.bots.find(b => b.platform === 'yunhu') as YunhuBot
    if (!bot) return;
    logger.info('Yunhu bot is ready')
    bot.online();
  })
}
  */
namespace YunhuBot {
  export interface Config {  // 导出接口
    token: string;
    endpoint?: string;
    path?: string;
  }

  export const Config: Schema<Config> = Schema.object({   //导出schema对象
    token: Schema.string().required().description('机器人 Token'),
    endpoint: Schema.string().default('https://chat-go.jwzhd.com').description('云湖 API Endpoint'),
    path: Schema.string().default('/yunhu').description('Webhook 路径'),
  })
}

export default YunhuBot