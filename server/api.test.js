import test from 'node:test'
import assert from 'node:assert/strict'
import { api } from './api.js'
import { localDatabase } from './local-db.js'
import { today, dateAt } from '../src/catalog.js'

test('booking lifecycle, overlaps, rescheduling and hours', async () => {
  const db = localDatabase(':memory:')
  try {
    const day = dateAt(today(),1)
    const tomorrow = dateAt(day,1)
    const req = (path,method='GET',body) => api(new Request('https://pitstop.test/api/'+path,{
      method,...(body ? {body:JSON.stringify(body)} : {})
    }),db)
    const sample = {day,start:600,service:'tires',name:'Демо',car:'Kia Rio',plate:'А123ВС 22',phone:'8 (900) 000-00-42'}
    assert.equal((await req('bookings','POST',{...sample,phone:'123'})).status,400)
    assert.equal((await req('bookings','POST',{...sample,plate:''})).status,400)
    const collision = await Promise.all([
      req('bookings','POST',sample),
      req('bookings','POST',{...sample,start:630}),
    ])
    assert.deepEqual(collision.map(r=>r.status).sort(),[201,409])
    const {id} = await collision.find(r=>r.status===201).json()
    assert.equal((await req('bookings/'+id,'PATCH',{status:'confirmed'})).status,200)
    assert.equal((await req('hours','PUT',{day,opening:720,closing:1080})).status,409)
    assert.equal((await req('bookings/'+id,'PATCH',{day:tomorrow,start:660})).status,200)
    const original = await (await req('calendar?day='+day)).json()
    assert.equal(original.bookings.length,0)
    const target = await (await req('calendar?day='+tomorrow)).json()
    assert.equal(target.bookings[0].status,'confirmed')
    assert.equal(target.bookings[0].plate,'А•••22')
    assert.equal(target.bookings[0].phone,'+7 ••• ••• •• 42')
    const slots = async date => (await (await req('slots?day='+date+'&service=oil')).json()).slots
    assert.ok(!(await slots(tomorrow)).includes(690))
    assert.equal((await req('bookings/'+id,'PATCH',{status:'cancelled'})).status,200)
    assert.ok((await slots(tomorrow)).includes(690))
    assert.equal((await req('hours','PUT',{day,opening:720,closing:780})).status,200)
    assert.deepEqual(await slots(day),[720,750])
    assert.equal((await req('bookings','POST',sample)).status,409)
    assert.equal((await req('slots?day=2027-02-30&service=oil')).status,400)
  } finally { db.close() }
})
