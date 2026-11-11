import { randomUUID } from 'node:crypto'

const keyboard = buttons => [{type: 'inline_keyboard', payload: {buttons}}]
const cancel = keyboard([[{type:'callback', text:'Отменить ответ', payload:'admin:reply-cancel'}]])

export function replyAction(db, update, command, adminUserId) {
  const begin = /^admin:reply:([1-9]\d*)$/.exec(command)
  if (begin) {
    const lead = db.prepare('SELECT id,data FROM leads WHERE id=?').get(Number(begin[1]))
    if (!lead) return {text:'Заявка не найдена.'}
    db.prepare('INSERT INTO operator_drafts(admin_id,id,lead_id,body) VALUES (?,?,?,NULL) ON CONFLICT(admin_id) DO UPDATE SET id=excluded.id,lead_id=excluded.lead_id,body=NULL').run(adminUserId,randomUUID(),lead.id)
    return {text:`Ответ по заявке №${lead.id} · ${JSON.parse(lead.data).service}\n\nВведите сообщение клиенту, до 3000 символов. Затем бот покажет его для подтверждения.`, attachments:cancel}
  }
  if (command === 'admin:reply-cancel' || command === '/cancel') {
    db.prepare('DELETE FROM operator_drafts WHERE admin_id=?').run(adminUserId)
    return {text:'Ответ отменён. Открыть заявки можно командой /leads.'}
  }
  const send = /^admin:send:([0-9a-f-]{36})$/.exec(command)
  if (send) {
    const draft = db.prepare('SELECT d.*, l.user_id, l.data FROM operator_drafts d JOIN leads l ON l.id=d.lead_id WHERE d.admin_id=? AND d.id=?').get(adminUserId,send[1])
    if (!draft?.body) return {text:'Этот черновик уже отправлен, отменён или изменён. Откройте карточку заявки для нового ответа.'}
    db.prepare('DELETE FROM operator_drafts WHERE admin_id=?').run(adminUserId)
    return {text:`Ответ по заявке №${draft.lead_id} передан в отправку.`, outgoing:{userId:draft.user_id, reply:{text:`Студия «Импульс» · по заявке №${draft.lead_id}\n\n${draft.body}`}}}
  }
  const draft = db.prepare('SELECT * FROM operator_drafts WHERE admin_id=?').get(adminUserId)
  if (!draft) return null
  if (command.startsWith('admin:') || command.startsWith('/') || command === 'Мои заявки') {
    db.prepare('DELETE FROM operator_drafts WHERE admin_id=?').run(adminUserId)
    return null
  }
  if (update.update_type !== 'message_created') return null
  if (!command || command.length > 3000) return {text:'Введите текст от 1 до 3000 символов.',attachments:cancel}
  const id = randomUUID()
  db.prepare('UPDATE operator_drafts SET id=?,body=? WHERE admin_id=?').run(id,command,adminUserId)
  const lead = db.prepare('SELECT data FROM leads WHERE id=?').get(draft.lead_id)
  return {text:`Предпросмотр ответа по заявке №${draft.lead_id}\nПолучатель — ${JSON.parse(lead.data).service}\n\n${command}\n\nОтправить клиенту? Чтобы изменить текст, пришлите новое сообщение.`, attachments:keyboard([
    [{type:'callback',text:'Отправить клиенту',payload:`admin:send:${id}`}],
    [{type:'callback',text:'Отменить ответ',payload:'admin:reply-cancel'}]
  ])}
}
