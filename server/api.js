import { services, today, dateAt } from '../src/catalog.js'

const active = "status != 'cancelled'"
const fits = `
  ? >= COALESCE((SELECT opening FROM hours WHERE day = ?),540)
  AND ? <= COALESCE((SELECT closing FROM hours WHERE day = ?),1140)
`
const noOverlap = `NOT EXISTS (
  SELECT 1 FROM bookings WHERE day = ? AND ${active} AND start < ? AND finish > ? AND id != ?
)`
const reply = (data, status = 200) => Response.json(data, {status, headers: {'Cache-Control':'no-store'}})
const fail = (error, status = 400) => reply({error}, status)
const validDay = day => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) &&
  Number.isFinite(Date.parse(day)) && dateAt(day, 0) === day &&
  day >= today() && day <= dateAt(today(), 30)
const aligned = n => Number.isInteger(n) && n % 30 === 0
const nowMinute = () => {
  const [h,m] = new Intl.DateTimeFormat('en-GB', {timeZone:'Asia/Novosibirsk',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date()).split(':').map(Number)
  return h * 60 + m
}
const future = (day, start) => day !== today() || start > nowMinute()
const label = (s, max) => typeof s === 'string' && s.trim().length > 0 && s.trim().length <= max

export async function api(request, db) {
  const url = new URL(request.url)
  const path = url.pathname
  const day = url.searchParams.get('day')
  const sql = (query, ...args) => db.prepare(query).bind(...args)
  const conflict = () => fail('Это время уже занято или выходит за рабочие часы. Выберите другое окно.', 409)

  if (request.method === 'GET' && ['/api/slots','/api/calendar'].includes(path)) {
    if (!validDay(day)) return fail('Выберите дату в пределах ближайших 30 дней.')
    const hours = await sql('SELECT opening,closing FROM hours WHERE day = ?', day).first() ?? {opening:540,closing:1140}
    if (path === '/api/calendar') {
      const {results} = await sql(`
        SELECT id,day,start,finish,service,name,car,status,
          CASE WHEN plate IS NOT NULL THEN substr(plate,1,1) || '•••' || substr(plate,-2) END AS plate,
          CASE WHEN phone IS NOT NULL THEN '+7 ••• ••• •• ' || substr(phone,-2) END AS phone
        FROM bookings WHERE day = ? ORDER BY start
      `, day).all()
      return reply({hours, bookings:results})
    }
    const service = services.find(item => item.id === url.searchParams.get('service'))
    if (!service) return fail('Выберите услугу.')
    const {results} = await sql(`SELECT start,finish FROM bookings WHERE day = ? AND ${active}`, day).all()
    const except = url.searchParams.get('except')
    const excluded = except && await sql(`SELECT start,finish FROM bookings WHERE id = ? AND day = ? AND ${active}`,except,day).first()
    const busy = excluded ? results.filter(row => row.start !== excluded.start || row.finish !== excluded.finish) : results
    const slots = []
    for (let time = hours.opening; time + service.duration <= hours.closing; time += 30) {
      if (future(day,time) && busy.every(row => row.finish <= time || row.start >= time + service.duration)) slots.push(time)
    }
    return reply({slots})
  }

  if (!['POST','PATCH','PUT'].includes(request.method)) return fail('Страница не найдена.',404)
  if (request.headers.get('origin') && request.headers.get('origin') !== url.origin) return fail('Недопустимый источник запроса.',403)
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('Проверьте данные формы.')

  if (path === '/api/bookings' && request.method === 'POST') {
    const {day,start,service,name,car} = body
    const plate = typeof body.plate === 'string' && body.plate.length <= 20 ? body.plate.toUpperCase().replace(/[\s-]/g,'') : ''
    const phone = typeof body.phone === 'string' && body.phone.length <= 25 ? body.phone.replace(/[\s()+-]/g,'').replace(/^8(?=\d{10}$)/,'7') : ''
    if (!/^[АВЕКМНОРСТУХABEKMHOPCTYX]\d{3}[АВЕКМНОРСТУХABEKMHOPCTYX]{2}\d{2,3}$/u.test(plate)) return fail('Укажите госномер в формате А123ВС 22.')
    if (!/^7\d{10}$/.test(phone)) return fail('Укажите телефон в формате +7 900 000-00-00.')
    const selected = services.find(item => item.id === service)
    if (!validDay(day) || !aligned(start) || !future(day,start) || !selected || !label(name,60) || !label(car,60)) return fail('Проверьте дату, время и данные записи.')
    const id = crypto.randomUUID()
    const finish = start + selected.duration
    const result = await sql(`INSERT INTO bookings (id,day,start,finish,service,name,car,plate,phone,status) SELECT ?,?,?,?,?,?,?,?,?,'pending' WHERE ${fits} AND ${noOverlap}`,
      id,day,start,finish,service,name.trim(),car.trim(),plate,phone,start,day,finish,day,day,finish,start,id).run()
    return result.meta.changes ? reply({id},201) : conflict()
  }

  const match = /^\/api\/bookings\/([0-9a-f-]{36})$/.exec(path)
  if (match && request.method === 'PATCH') {
    const id = match[1]
    if (['confirmed','cancelled'].includes(body.status)) {
      const result = await sql(`UPDATE bookings SET status = ? WHERE id = ? AND ${active}`,body.status,id).run()
      return result.meta.changes ? reply({ok:true}) : fail('Активная запись не найдена.',404)
    }
    const {day,start} = body
    if (!validDay(day) || !aligned(start) || !future(day,start)) return fail('Выберите доступную дату и время.')
    const booking = await sql(`SELECT service FROM bookings WHERE id = ? AND ${active}`,id).first()
    if (!booking) return fail('Активная запись не найдена.',404)
    const finish = start + services.find(item => item.id === booking.service).duration
    const result = await sql(`UPDATE bookings SET day = ?,start = ?,finish = ? WHERE id = ? AND ${active} AND ${fits} AND ${noOverlap}`,
      day,start,finish,id,start,day,finish,day,day,finish,start,id).run()
    return result.meta.changes ? reply({ok:true}) : conflict()
  }

  if (path === '/api/hours' && request.method === 'PUT') {
    const {day,opening,closing} = body
    if (!validDay(day) || !aligned(opening) || !aligned(closing) || opening < 0 || closing > 1440 || opening > closing) return fail('Проверьте рабочие часы.')
    const result = await sql(`INSERT INTO hours SELECT ?,?,? WHERE NOT EXISTS (
      SELECT 1 FROM bookings WHERE day = ? AND ${active} AND (start < ? OR finish > ?)
    ) ON CONFLICT(day) DO UPDATE SET opening=excluded.opening,closing=excluded.closing`,
      day,opening,closing,day,opening,closing).run()
    return result.meta.changes ? reply({ok:true}) : fail('Сначала перенесите или отмените записи за пределами нового графика.',409)
  }

  return fail('Страница не найдена.',404)
}
