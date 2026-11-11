import { replyAction } from './replies.js'
export const sources = {site:'Сайт', ads:'Объявление', personal:'Личное предложение'}
export const statuses = {new: 'Новая', working: 'В работе', contacted: 'Связался', connected: 'Подключён', rejected: 'Отказ'}
const button = (text, payload) => ({type: 'callback', text, payload})
const keyboard = buttons => [{type: 'inline_keyboard', payload: {buttons}}]
export const adminMenu = menu => keyboard([
  ...menu[0].payload.buttons,
  [button('Мои заявки', 'admin:list:0')]
])

export function leadCard(lead, heading = 'Заявка PitStop') {
  const data = JSON.parse(lead.data)
  return {
    text: `${heading} №${lead.id}\nСтатус: ${statuses[lead.status]}\nИсточник: ${sources[lead.source] ?? "Не определён"}\nСоздана: ${lead.created} UTC\n\nАвтосервис: ${data.service}\nГород: ${data.city}\nПостов: ${data.posts}\nПожелания: ${data.wishes}\nКонтакт: ${data.contact}`,
    attachments: keyboard([
      [button('В работу', `admin:status:${lead.id}:${lead.version}:working`), button('Связался', `admin:status:${lead.id}:${lead.version}:contacted`)],
      [button('Подключён', `admin:status:${lead.id}:${lead.version}:connected`), button('Отказ', `admin:status:${lead.id}:${lead.version}:rejected`)],
      [button('Ответить клиенту', `admin:reply:${lead.id}`)],
      [button('Мои заявки', 'admin:list:0')]
    ])
  }
}

// Runs in the same transaction as event deduplication and the reply queue.
export function adminAction(db, update, adminUserId) {
  const user = update.callback?.user ?? update.message?.sender
  const command = update.update_type === 'message_callback' ? update.callback?.payload : update.message?.body?.text?.trim()
  const drafting = user?.user_id === adminUserId && db.prepare('SELECT 1 FROM operator_drafts WHERE admin_id=?').get(adminUserId)
  if (typeof command !== 'string' || !(command.startsWith('admin:') || ['/leads', 'Мои заявки'].includes(command) || drafting)) return null
  if (!adminUserId || user?.user_id !== adminUserId || user.is_bot ||
      (update.message && update.message.recipient?.chat_type !== 'dialog')) return {text: 'Управление заявками доступно владельцу бота.'}
  const answer = replyAction(db, update, command, adminUserId)
  if (answer) return answer
  const list = /^(?:admin:list:(0|[1-9]\d*)|\/leads|Мои заявки)$/.exec(command)
  if (list) {
    const before = Number(list[1] || 0)
    if (!Number.isSafeInteger(before)) return {text: 'Некорректная страница.'}
    const rows = db.prepare('SELECT id,data,status FROM leads WHERE (?=0 OR id<?) ORDER BY id DESC LIMIT 6').all(before, before)
    const visible = rows.slice(0, 5)
    const buttons = visible.map(row => [button(`№${row.id} · ${statuses[row.status]}`, `admin:lead:${row.id}`)])
    if (rows.length > 5) buttons.push([button('Ещё заявки', `admin:list:${visible.at(-1).id}`)])
    if (before) buttons.push([button('К новым заявкам', 'admin:list:0')])
    return {text: visible.length ? 'Мои заявки\n\n' + visible.map(row => `№${row.id} · ${statuses[row.status]}\n${JSON.parse(row.data).service}`).join('\n\n') : 'Заявок пока нет.', attachments: keyboard(buttons)}
  }
  if (!command.startsWith('admin:')) return null
  const detail = /^admin:lead:([1-9]\d*)$/.exec(command)
  const change = /^admin:status:([1-9]\d*):(\d+):(working|contacted|connected|rejected)$/.exec(command)
  if (!detail && !change) return {text: 'Команда устарела. Откройте /leads.'}
  const id = Number((detail ?? change)[1])
  if (!Number.isSafeInteger(id)) return {text: 'Некорректный номер заявки.'}
  if (change) {
    const version = Number(change[2])
    const updated = db.prepare('UPDATE leads SET status=?, version=version+1 WHERE id=? AND version=?').run(change[3], id, version)
    if (!updated.changes) {
      const latest = db.prepare('SELECT * FROM leads WHERE id=?').get(id)
      return latest ? leadCard(latest, 'Кнопка устарела. Текущая заявка') : {text: 'Заявка не найдена.'}
    }
  }
  const lead = db.prepare('SELECT * FROM leads WHERE id=?').get(id)
  return lead ? leadCard(lead, change ? 'Статус сохранён. Заявка' : 'Заявка PitStop') : {text: 'Заявка не найдена.'}
}
