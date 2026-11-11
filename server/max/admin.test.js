import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { store } from './service.js'
import { adminMenu } from './admin.js'
import { menu } from './bot.js'

test('legacy leads migrate, private management, version checks, retries and pagination', () => {
  const folder = mkdtempSync(join(tmpdir(), 'max-admin-'))
  const path = join(folder, 'db.sqlite')
  const legacy = new DatabaseSync(path)
  legacy.exec('CREATE TABLE leads (id INTEGER PRIMARY KEY, event_id TEXT UNIQUE NOT NULL, user_id INTEGER NOT NULL, data TEXT NOT NULL, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)')
  for (let id = 1; id <= 7; id++) legacy.prepare('INSERT INTO leads(id,event_id,user_id,data) VALUES (?,?,?,?)').run(id, `old-${id}`, 42, JSON.stringify({service:`Сервис ${id}`, city:'Барнаул', posts:'2', wishes:'Тест', contact:'test@example.com'}))
  legacy.close()
  const app = store(path, {adminUserId: 999})
  const click = (payload, userId = 999) => ({update_type:'message_callback', callback:{payload, user:{user_id:userId,is_bot:false}}})
  const last = () => JSON.parse(app.db.prepare('SELECT body FROM outbox ORDER BY id DESC LIMIT 1').get().body)
  try {
    app.accept(click('admin:lead:1', 123))
    assert.doesNotMatch(last().text, /test@example.com/)
    app.accept(click('admin:status:1:0:working', 123))
    assert.equal(app.db.prepare('SELECT status FROM leads WHERE id=1').get().status, 'new')
    app.accept(click('admin:list:0'))
    assert.match(last().text, /Сервис 7/)
    assert.doesNotMatch(last().text, /Сервис 2/)
    assert.equal(last().attachments[0].payload.buttons.at(-1)[0].payload, 'admin:list:3')
    app.accept(click('admin:list:3'))
    assert.match(last().text, /Сервис 2/)
    app.accept(click('admin:status:1:0:working'))
    app.accept(click('admin:status:1:0:working'))
    assert.deepEqual({...app.db.prepare('SELECT status,version FROM leads WHERE id=1').get()}, {status:'working',version:1})
    app.accept(click('admin:status:1:0:rejected'))
    assert.match(last().text, /Кнопка устарела/)
    assert.equal(app.db.prepare('SELECT status FROM leads WHERE id=1').get().status, 'working')
    app.accept(click('admin:status:1:1:connected'))
    assert.equal(app.db.prepare('SELECT status FROM leads WHERE id=1').get().status, 'connected')
  } finally { app.db.close(); rmSync(folder, {recursive:true,force:true}) }
})

test("owner menu has a single inline keyboard attachment", () => {
  const result = adminMenu(menu)
  assert.equal(result.length, 1)
  assert.equal(result[0].type, "inline_keyboard")
  assert.equal(result[0].payload.buttons.length, 4)
  assert.equal(menu[0].payload.buttons.length, 3)
})
