import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { store } from './service.js'
const user = user_id => ({user_id,is_bot:false})
let sequence = 0
const click = (payload,id=999) => ({update_type:'message_callback',callback:{user:user(id),payload,callback_id:String(++sequence)}})
const message = (text,id=999) => ({update_type:'message_created',message:{sender:user(id),recipient:{chat_type:'dialog'},body:{text,mid:String(++sequence)}}})

test('reply preview survives restart, requires owner confirmation and sends once to lead author', () => {
  const folder=mkdtempSync(join(tmpdir(),'max-reply-'))
  const path=join(folder,'db.sqlite')
  let app=store(path,{adminUserId:999})
  const last=() => JSON.parse(app.db.prepare('SELECT body FROM outbox ORDER BY id DESC LIMIT 1').get().body)
  try {
    app.db.prepare('INSERT INTO leads(event_id,user_id,data) VALUES (?,?,?)').run('lead',42,JSON.stringify({service:'Тест'}))
    app.accept(click('admin:reply:1',123))
    assert.equal(app.db.prepare('SELECT count(*) AS n FROM operator_drafts').get().n,0)
    app.accept(click('admin:reply:1'))
    app.accept(message('Уточните рабочий график.'))
    const send1=last().attachments[0].payload.buttons[0][0].payload
    assert.equal(app.db.prepare('SELECT count(*) AS n FROM outbox WHERE user_id=42').get().n,0)
    app.accept(message('Уточните график и услуги.'))
    const send2=last().attachments[0].payload.buttons[0][0].payload
    app.accept(click(send1))
    assert.equal(app.db.prepare('SELECT count(*) AS n FROM outbox WHERE user_id=42').get().n,0)
    app.db.close()
    app=store(path,{adminUserId:999})
    app.accept(click(send2,123))
    assert.equal(app.db.prepare('SELECT count(*) AS n FROM outbox WHERE user_id=42').get().n,0)
    app.accept(click(send2))
    app.accept(click(send2))
    const sent=app.db.prepare('SELECT body FROM outbox WHERE user_id=42').all()
    assert.equal(sent.length,1)
    assert.match(JSON.parse(sent[0].body).text,/график и услуги/)
    app.accept(click('admin:reply:1'))
    app.accept(message('/leads'))
    assert.equal(app.db.prepare('SELECT count(*) AS n FROM operator_drafts').get().n,0)
  } finally {app.db.close();rmSync(folder,{recursive:true,force:true})}
})

test('tagged source is saved on lead and public sections use one keyboard', () => {
  const folder=mkdtempSync(join(tmpdir(),'max-source-'))
  const app=store(join(folder,'db.sqlite'),{adminUserId:999})
  try {
    app.accept({update_type:'bot_started',user:user(42),payload:'ads'})
    app.accept(click('quote_begin',42))
    for(const text of ['Тестовый сервис','Барнаул','2','Тест','test@example.com']) app.accept(message(text,42))
    assert.equal(app.db.prepare('SELECT source FROM leads').get().source,'ads')
    app.accept({update_type:'bot_started',user:user(42),payload:'personal'})
    assert.equal(app.db.prepare('SELECT source FROM leads').get().source,'ads')
    for(const section of ['examples','terms']) {
      app.accept(click(section,42))
      const reply=JSON.parse(app.db.prepare('SELECT body FROM outbox ORDER BY id DESC LIMIT 1').get().body)
      assert.equal(reply.attachments.length,1)
      assert.ok(reply.text.length>100)
    }
  } finally {app.db.close();rmSync(folder,{recursive:true,force:true})}
})
