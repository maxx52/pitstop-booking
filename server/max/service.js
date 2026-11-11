import { DatabaseSync } from 'node:sqlite'
import { createHash, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdirSync, chmodSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transition, menu } from './bot.js'
import { adminAction, adminMenu, leadCard, sources } from './admin.js'

export const apiOrigin = 'https://platform-api2.max.ru'
export async function maxApi(token, path, body) {
  const response = await fetch(apiOrigin + path, {
    method: 'POST', headers: {Authorization: token, 'Content-Type': 'application/json'},
    body: JSON.stringify(body), signal: AbortSignal.timeout(15000)
  })
  const result = await response.json()
  if (!response.ok || result.success === false || result.code) throw new Error('MAX API rejected request')
  return result
}

export function store(path, {adminUserId} = {}) {
  mkdirSync(dirname(path), {recursive: true, mode: 0o700})
  const db = new DatabaseSync(path)
  chmodSync(path, 0o600)
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS operator_drafts (admin_id INTEGER PRIMARY KEY, id TEXT NOT NULL, lead_id INTEGER NOT NULL, body TEXT);
    CREATE TABLE IF NOT EXISTS user_sources (user_id INTEGER PRIMARY KEY, source TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (user_id INTEGER PRIMARY KEY, state TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, received TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS leads (id INTEGER PRIMARY KEY, event_id TEXT UNIQUE NOT NULL, user_id INTEGER NOT NULL, data TEXT NOT NULL, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS outbox (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, body TEXT NOT NULL, sent INTEGER NOT NULL DEFAULT 0);
  `)
  const columns = db.prepare('PRAGMA table_info(leads)').all()
  if (!columns.some(column => column.name === 'status')) db.exec("ALTER TABLE leads ADD COLUMN status TEXT NOT NULL DEFAULT 'new'")
  if (!columns.some(column => column.name === 'version')) db.exec('ALTER TABLE leads ADD COLUMN version INTEGER NOT NULL DEFAULT 0')
  if (!columns.some(column => column.name === 'source')) db.exec("ALTER TABLE leads ADD COLUMN source TEXT")
  return {
    db,
    accept(update) {
      const id = createHash('sha256').update(JSON.stringify(update)).digest('hex')
      db.exec('BEGIN IMMEDIATE')
      try {
        if (db.prepare('SELECT 1 FROM events WHERE id=?').get(id)) {
          db.exec('COMMIT')
          return
        }
        const userId = update.user?.user_id ?? update.callback?.user?.user_id ?? update.message?.sender?.user_id
        const management = adminAction(db, update, adminUserId)
        if (management) {
          db.prepare('INSERT INTO events(id) VALUES (?)').run(id)
          const {outgoing, ...reply} = management
          if (outgoing) db.prepare('INSERT INTO outbox(user_id,body) VALUES (?,?)').run(outgoing.userId, JSON.stringify(outgoing.reply))
          if (Number.isSafeInteger(userId)) db.prepare('INSERT INTO outbox(user_id,body) VALUES (?,?)').run(userId, JSON.stringify(reply))
          db.exec('COMMIT')
          return
        }
        if (update.update_type === 'bot_started' && Number.isSafeInteger(userId) && !update.user?.is_bot && Object.hasOwn(sources, update.payload ?? '')) {
          db.prepare('INSERT INTO user_sources VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET source=excluded.source').run(userId,update.payload)
        }
        const row = Number.isSafeInteger(userId) && db.prepare('SELECT state FROM sessions WHERE user_id=?').get(userId)
        const result = transition(update, row ? JSON.parse(row.state) : null)
        db.prepare('INSERT INTO events(id) VALUES (?)').run(id)
        if (result) {
          db.prepare('INSERT INTO sessions VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET state=excluded.state').run(result.userId, JSON.stringify(result.state))
          if (result.lead) {
            const source = db.prepare('SELECT source FROM user_sources WHERE user_id=?').get(result.userId)?.source ?? null
            const inserted = db.prepare('INSERT INTO leads(event_id,user_id,data,source) VALUES (?,?,?,?)').run(id, result.userId, JSON.stringify(result.lead),source)
            if (adminUserId) {
              const lead = db.prepare('SELECT * FROM leads WHERE id=?').get(inserted.lastInsertRowid)
              db.prepare('INSERT INTO outbox(user_id,body) VALUES (?,?)').run(adminUserId, JSON.stringify(leadCard(lead, 'Новая заявка PitStop')))
            }
          }
          if (result.userId === adminUserId && result.reply.attachments === menu) result.reply.attachments = adminMenu(menu)
          db.prepare('INSERT INTO outbox(user_id,body) VALUES (?,?)').run(result.userId, JSON.stringify(result.reply))
        }
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    }
  }
}

export function start({token, secret, database, port = 3174, send = maxApi, adminUserId}) {
  if (!token || !/^[a-zA-Z0-9_-]{16,256}$/.test(secret ?? '')) throw new Error('Set MAX_BOT_TOKEN and MAX_WEBHOOK_SECRET (16–256 characters)')
  if (adminUserId !== undefined && (!Number.isSafeInteger(adminUserId) || adminUserId <= 0)) throw new Error('Invalid MAX_ADMIN_USER_ID')
  const storage = store(database, {adminUserId})
  let running = false
  async function deliver() {
    if (running) return
    running = true
    try {
      for (const row of storage.db.prepare('SELECT * FROM outbox WHERE sent=0 ORDER BY id LIMIT 100').all()) {
        try {
          await send(token, `/messages?user_id=${row.user_id}`, JSON.parse(row.body))
          storage.db.prepare('UPDATE outbox SET sent=1 WHERE id=?').run(row.id)
        } catch {
          console.error(`MAX delivery failed for queued reply ${row.id}; will retry`)
        }
      }
    } catch {
      console.error('MAX delivery failed; queued replies will be retried')
    } finally {
      running = false
    }
  }
  const server = createServer(async (req, res) => {
    const end = status => { res.writeHead(status); res.end() }
    if (req.method === 'GET' && req.url === '/health') return end(200)
    if (req.method !== 'POST' || req.url !== '/api/max/webhook') return end(404)
    const provided = Buffer.from(String(req.headers['x-max-bot-api-secret'] ?? ''))
    const expected = Buffer.from(secret)
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return end(403)
    try {
      const chunks = []
      let size = 0
      for await (const chunk of req) {
        size += chunk.length
        if (size > 65536) return end(413)
        chunks.push(chunk)
      }
      let update
      try { update = JSON.parse(Buffer.concat(chunks).toString()) } catch { return end(400) }
      if (!update || typeof update !== 'object' || Array.isArray(update)) return end(400)
      if (!['bot_started', 'message_created', 'message_callback'].includes(update.update_type)) return end(200)
      storage.accept(update)
      end(200)
      void deliver()
    } catch {
      console.error('MAX webhook could not be stored')
      if (!res.headersSent) end(500)
    }
  })
  server.requestTimeout = 15000
  const timer = setInterval(deliver, 10000)
  timer.unref()
  server.on('close', () => clearInterval(timer))
  server.listen(port, '127.0.0.1')
  void deliver()
  return {server, storage}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start({token: process.env.MAX_BOT_TOKEN, secret: process.env.MAX_WEBHOOK_SECRET,
    adminUserId: process.env.MAX_ADMIN_USER_ID ? Number(process.env.MAX_ADMIN_USER_ID) : undefined,
    database: process.env.MAX_BOT_DB || './private/max-bot.sqlite', port: Number(process.env.MAX_BOT_PORT || 3174)})
}
