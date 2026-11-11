import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { transition } from './bot.js'
import { store, start } from './service.js'
const user = {user_id: 123, is_bot: false}
const message = text => ({update_type: 'message_created', message: {sender: user, recipient: {chat_type: 'dialog'}, body: {text, mid: text}}})
const button = payload => ({update_type: 'message_callback', callback: {user, payload}})
test('quote validation, duplicate delivery and persistence across restart', () => {
  const folder = mkdtempSync(join(tmpdir(), 'pitstop-max-'))
  const storage = store(join(folder, 'bot.sqlite'), {adminUserId: 999})
  try {
    storage.accept(button('quote_begin'))
    storage.accept(message('Тестовый сервис'))
    storage.accept(message('Барнаул'))
    storage.accept(message('0'))
    assert.equal(JSON.parse(storage.db.prepare('SELECT state FROM sessions').get().state).step, 'posts')
    storage.accept(message('2'))
    storage.accept(message('Настройка услуг'))
    storage.accept(message('test@example.com'))
    storage.accept(message('test@example.com'))
    const leads = storage.db.prepare('SELECT * FROM leads').all()
    assert.equal(leads.length, 1)
    const alerts = storage.db.prepare('SELECT body FROM outbox WHERE user_id=999').all()
    assert.equal(alerts.length, 1)
    assert.match(JSON.parse(alerts[0].body).text, /Новая заявка PitStop №1/)
    assert.match(JSON.parse(alerts[0].body).text, /test@example.com/)
    assert.equal(JSON.parse(leads[0].data).city, 'Барнаул')
    assert.equal(JSON.parse(storage.db.prepare('SELECT state FROM sessions').get().state).step, null)
    storage.db.close()
    const reopened = store(join(folder, 'bot.sqlite'))
    assert.equal(reopened.db.prepare('SELECT count(*) AS n FROM leads').get().n, 1)
    reopened.db.close()
  } finally { rmSync(folder, {recursive: true, force: true}) }
})
test('cancel clears draft and groups are ignored', () => {
  const draft = transition(button('quote_begin'), null)
  assert.equal(transition(button('cancel'), draft.state).state.step, null)
  const group = message('/start')
  group.message.recipient.chat_type = 'chat'
  assert.equal(transition(group, null), null)
})
test('forged webhook rejected and pending reply survives failed delivery', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'pitstop-max-'))
  const app = start({token: 'test', secret: 'test-secret-123456', database: join(folder, 'bot.sqlite'), port: 0, send: async () => { throw new Error('offline') }})
  await new Promise(resolve => app.server.once('listening', resolve))
  const url = `http://127.0.0.1:${app.server.address().port}/api/max/webhook`
  try {
    assert.equal((await fetch(url, {method: 'POST', body: '{}'})).status, 403)
    const init = {method: 'POST', headers: {'x-max-bot-api-secret': 'test-secret-123456'}, body: JSON.stringify(message('/start'))}
    assert.equal((await fetch(url, init)).status, 200)
    assert.equal((await fetch(url, init)).status, 200)
    assert.equal(app.storage.db.prepare('SELECT count(*) AS n FROM outbox WHERE sent=0').get().n, 1)
  } finally {
    await new Promise(resolve => app.server.close(resolve))
    app.storage.db.close()
    rmSync(folder, {recursive: true, force: true})
  }
})
