import { maxApi } from './service.js'
const token = process.env.MAX_BOT_TOKEN
const secret = process.env.MAX_WEBHOOK_SECRET
const url = process.env.MAX_WEBHOOK_URL || 'https://pitstop.maxxdev.ru/api/max/webhook'
if (!token || !/^[a-zA-Z0-9_-]{16,256}$/.test(secret ?? '')) throw new Error('Set MAX_BOT_TOKEN and MAX_WEBHOOK_SECRET')
if (new URL(url).protocol !== 'https:') throw new Error('HTTPS webhook URL required')
await maxApi(token, '/subscriptions', {url, secret, update_types: ['bot_started', 'message_created', 'message_callback']})
console.log('MAX webhook registered')
