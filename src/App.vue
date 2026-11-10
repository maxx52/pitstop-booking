<script setup>
import { computed, ref, watch } from 'vue'
import Icon from './Icon.vue'
import Blueprint from './Blueprint.vue'
import { services, money, clock, today, dateAt } from './catalog.js'

const admin = location.pathname === '/admin'
const firstDay = today()
const lastDay = dateAt(firstDay,30)
const day = ref(firstDay)
const page = ref(0)
const dateOptions = computed(() => Array.from({length: Math.min(7,31-page.value*7)}, (_,i) => dateAt(firstDay,page.value*7+i)))
const dateFormat = (value, options) => new Intl.DateTimeFormat('ru-RU',{...options,timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'))
const fullDate = value => dateFormat(value,{day:'numeric',month:'long'})
const service = ref(services[0])
const start = ref(null)
const name = ref('')
const car = ref('')
const plate = ref('')
const phone = ref('')
const slots = ref([])
const error = ref('')
const loading = ref(false)
const saving = ref(false)
const receipt = ref(null)
const bookings = ref([])
const opening = ref(540)
const closing = ref(1140)
const notice = ref('')
const moving = ref(null)
const moveDay = ref(firstDay)
const moveStart = ref(null)
const moveSlots = ref([])
const moveLoading = ref(false)
const moveError = ref('')
const minutes = Array.from({length:49},(_,i)=>i*30)
const statuses = {pending:'Ожидает подтверждения',confirmed:'Подтверждена',cancelled:'Отменена'}
const counts = computed(() => [
  {label:'Всего записей',value:bookings.value.length},
  {label:'Ожидают подтверждения',value:bookings.value.filter(b=>b.status==='pending').length},
  {label:'Подтверждены',value:bookings.value.filter(b=>b.status==='confirmed').length},
])
const byId = id => services.find(item=>item.id===id)

async function request(path, method='GET', data, signal) {
  const response = await fetch('/api/'+path,{
    method,signal,
    ...(data ? {headers:{'content-type':'application/json'},body:JSON.stringify(data)} : {})
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'Не удалось выполнить запрос.')
  return result
}

watch([day,service], async (_,__,onCleanup) => {
  const controller = new AbortController()
  onCleanup(()=>controller.abort())
  if (!admin) start.value = null
  error.value = ''
  loading.value = true
  slots.value = []
  bookings.value = []
  try {
    if (admin) await loadCalendar(controller.signal)
    else slots.value = (await request('slots?day='+day.value+'&service='+service.value.id,'GET',null,controller.signal)).slots
  } catch (e) { if (!controller.signal.aborted) error.value = e.message }
  finally { if (!controller.signal.aborted) loading.value = false }
},{immediate:true})

watch(moveDay,()=>{ if(moving.value) loadMoveSlots() })
let moveRequest
async function loadMoveSlots() {
  moveRequest?.abort()
  const controller = new AbortController()
  moveRequest = controller
  const booking = moving.value
  moveStart.value = null
  moveSlots.value = []
  moveLoading.value = true
  moveError.value = ''
  try {
    const result = await request('slots?day='+moveDay.value+'&service='+booking.service+'&except='+booking.id,'GET',null,controller.signal)
    if (!controller.signal.aborted) moveSlots.value = result.slots
  } catch(e) { if (!controller.signal.aborted) moveError.value = e.message }
  finally { if (!controller.signal.aborted) moveLoading.value = false }
}
async function loadCalendar(signal) {
  const currentDay = day.value
  const data = await request('calendar?day='+currentDay,'GET',null,signal)
  if (currentDay !== day.value || signal?.aborted) return
  bookings.value = data.bookings
  opening.value = data.hours.opening
  closing.value = data.hours.closing
}
async function submit() {
  if (saving.value || start.value === null) return
  saving.value = true
  error.value = ''
  const selected = {day:day.value,start:start.value,service:service.value.id,name:name.value,car:car.value,plate:plate.value,phone:phone.value}
  try {
    const data = await request('bookings','POST',selected)
    receipt.value = {...selected,id:data.id}
  } catch(e) {
    error.value = e.message
    try {
      slots.value = (await request('slots?day='+day.value+'&service='+service.value.id)).slots
      if (!slots.value.includes(start.value)) start.value = null
    } catch {}
  } finally { saving.value = false }
}
async function adminAction(path,method,data,message) {
  if (saving.value) return
  saving.value = true
  error.value = ''
  notice.value = ''
  try {
    await request(path,method,data)
    if (moving.value) closeMove()
    notice.value = message
    await loadCalendar()
  } catch(e) { 
    if (moving.value) { await loadMoveSlots(); moveError.value = e.message }
    else error.value = e.message
  } finally { saving.value = false }
}
function openMove(booking) {
  if (moveDay.value === booking.day) {
    moving.value = booking
    loadMoveSlots()
  } else {
    moving.value = booking
    moveDay.value = booking.day
  }
}
function changeDate(event, target) {
  const input = event.target
  if (!input.value || !input.validity.valid) {
    input.value = target === 'move' ? moveDay.value : day.value
    return
  }
  if (target === 'move') moveDay.value = input.value
  else { day.value = input.value; notice.value = '' }
}
function closeMove() { moveRequest?.abort(); moving.value = null }
function nextBooking() {
  receipt.value = null
  name.value = ''
  car.value = ''
  plate.value = ''
  phone.value = ''
  const chosen = service.value
  const chosenDay = day.value
  start.value = null
  slots.value = []
  loading.value = true
  request('slots?day='+chosenDay+'&service='+chosen.id).then(data=>{
    if (day.value === chosenDay && service.value === chosen) slots.value = data.slots
  }).catch(e=>{error.value=e.message}).finally(()=>{if(day.value===chosenDay && service.value===chosen)loading.value=false})
}
</script>

<template>
<header class="top"><div class="wrap top-inner">
  <a href="/" class="brand"><span class="brand-icon"><Icon name="logo" :size="24"/></span><span>ПИТ<span class="brand-accent">СТОП</span><small>АВТОСЕРВИС</small></span></a>
  <nav aria-label="Режим просмотра"><a href="/" :aria-current="!admin?'page':undefined">Онлайн-запись</a><a href="/admin" :aria-current="admin?'page':undefined"><Icon name="calendar" :size="16"/> <span>Администратор</span></a></nav>
</div></header>

<main class="wrap">
  <template v-if="!admin">
  <section class="hero">
    <div class="hero-copy"><div class="eyebrow"><span></span> ДЕМО АВТОСЕРВИСА</div>
      <h1>Запись<br>в <em>автосервис.</em></h1>
      <p>Выберите услугу и удобное время. Заявка сразу появится в календаре администратора.</p>
    </div><Blueprint/>
  </section>

  <section v-if="receipt" class="panel receipt" aria-live="polite">
    <span class="service-icon"><Icon name="check" :size="26"/></span>
    <h2>Заявка принята</h2>
    <p>{{ byId(receipt.service).name }} · {{ fullDate(receipt.day) }}, {{ clock(receipt.start) }}</p>
    <p>Статус: ожидает подтверждения. Заявка {{ receipt.id.slice(0,8).toUpperCase() }}.</p>
    <div class="actions"><button class="primary" @click="nextBooking">Новая запись</button><a href="/admin" class="subtle">Открыть календарь <Icon name="arrow" :size="16"/></a></div>
  </section>

  <form v-else class="booking-layout" @submit.prevent="submit">
    <fieldset class="flow" :disabled="saving">
      <section class="panel">
        <div class="section-heading"><span>01</span><div><h2>Выберите услугу</h2><p>Стоимость работ и время на обслуживание</p></div></div>
        <div class="services">
          <button v-for="item in services" :key="item.id" class="service" type="button" :aria-pressed="service.id===item.id" @click="service=item">
            <span class="service-top"><span class="service-icon"><Icon :name="item.icon"/></span><span class="radio"></span></span>
            <strong>{{ item.name }}</strong><small>{{ item.description }}</small>
            <span class="service-bottom"><b>от {{ money(item.price) }}</b><span><Icon name="clock" :size="14"/> {{ item.duration }} мин</span></span>
          </button>
        </div>
      </section>
      <section class="panel">
        <div class="section-heading"><span>02</span><div><h2>Дата и время</h2><p>Показываем свободные окна с учётом длительности работ</p></div></div>
        <div class="date-head"><strong>{{ dateFormat(dateOptions[0],{month:'long',year:'numeric'}) }}</strong><div><button type="button" class="icon-btn" aria-label="Предыдущая неделя" :disabled="page===0" @click="page--"><Icon name="left" :size="17"/></button><button type="button" class="icon-btn" aria-label="Следующая неделя" :disabled="page===4" @click="page++"><Icon name="right" :size="17"/></button></div></div>
        <div class="days"><button v-for="date in dateOptions" :key="date" type="button" :aria-pressed="day===date" :aria-label="fullDate(date)" @click="day=date"><small>{{ dateFormat(date,{weekday:'short'}) }}</small><strong>{{ Number(date.slice(-2)) }}</strong></button></div>
        <p v-if="loading" class="muted" role="status">Загружаем свободные окна…</p>
        <p v-else-if="!slots.length" class="muted">На эту дату свободных окон нет. Выберите другой день.</p>
        <div v-else class="slots"><button v-for="slot in slots" :key="slot" type="button" :aria-pressed="start===slot" @click="start=slot">{{ clock(slot) }}</button></div>
      </section>
      <section class="panel">
        <div class="section-heading"><span>03</span><div><h2>Данные для записи</h2><p>Для демо используйте только вымышленные данные</p></div></div>
        <div class="fields"><label>Имя<input v-model.trim="name" placeholder="Например, Алексей" required maxlength="60"></label><label>Автомобиль<input v-model.trim="car" placeholder="Например, Kia Rio" required maxlength="60"></label>
          <label>Госномер<input v-model.trim="plate" placeholder="А123ВС 22" autocapitalize="characters" spellcheck="false" required maxlength="20"></label>
          <label>Телефон<input v-model.trim="phone" type="tel" inputmode="tel" autocomplete="off" placeholder="+7 900 000-00-00" required maxlength="25"></label>
        </div>
      </section>
    </fieldset>
    <aside class="summary panel">
      <span class="section-tag"><Icon name="calendar" :size="16"/> ВАША ЗАПИСЬ</span>
      <h2>{{ service.name }}</h2>
      <div class="summary-row"><span>Дата</span><b>{{ fullDate(day) }}</b></div>
      <div class="summary-row"><span>Время</span><b>{{ start===null ? 'Выберите окно' : clock(start) }}</b></div>
      <div class="summary-row"><span>Длительность</span><b>{{ service.duration }} мин</b></div>
      <div class="summary-total"><span>Стоимость</span><strong>от {{ money(service.price) }}</strong></div>
      <p v-if="error" role="alert" class="error">{{ error }}</p>
      <button type="submit" class="primary submit" :disabled="start===null || saving">{{ saving ? 'Отправляем…' : 'Записаться' }} <Icon name="arrow" :size="18"/></button>
      <p class="summary-foot"><Icon name="shield" :size="16"/> Демонстрационный сервис</p>
    </aside>
  </form>
  </template>

  <template v-else>
    <section class="admin-hero"><div class="eyebrow"><span></span> ДЕМО АВТОСЕРВИСА</div><h1>Календарь <em>записей.</em></h1><p>Подтверждайте заявки, переносите визиты и задавайте рабочие часы.</p></section>
    <div class="admin-layout">
      <div class="flow">
        <div class="stats"><div class="panel stat" v-for="count in counts" :key="count.label"><span>{{ count.label }}</span><strong>{{ count.value }}</strong></div></div>
        <section class="panel">
          <div class="calendar-head"><div class="section-heading"><span><Icon name="calendar" :size="19"/></span><div><h2>Записи на {{ fullDate(day) }}</h2><p>Один сервисный пост · время Новосибирска</p></div></div><label class="date-label">Дата<input type="date" :value="day" :min="firstDay" :max="lastDay" required :disabled="saving" @change="changeDate($event, 'calendar')"></label></div>
          <p v-if="notice" role="status" class="notice">{{ notice }}</p><p v-if="error" role="alert" class="error">{{ error }}</p>
          <p v-if="loading" class="muted">Загружаем календарь…</p>
          <div v-else-if="!bookings.length" class="empty"><Icon name="calendar" :size="27"/><strong>Записей пока нет</strong><p>Создайте заявку в клиентском режиме или выберите другую дату.</p><a href="/" class="subtle">Открыть онлайн-запись <Icon name="arrow" :size="16"/></a></div>
          <article class="booking" v-for="item in bookings" :key="item.id">
            <div class="booking-time"><strong>{{ clock(item.start) }}</strong><small>до {{ clock(item.finish) }}</small></div>
            <div class="booking-detail"><strong>{{ byId(item.service)?.name }}</strong><span>{{ item.name }} · {{ item.car }}</span><span v-if="item.plate && item.phone">{{ item.plate }} · {{ item.phone }}</span><span class="status" :class="item.status">{{ statuses[item.status] }}</span></div>
            <div class="booking-actions" v-if="item.status!=='cancelled'">
              <button v-if="item.status==='pending'" class="secondary" :disabled="saving" @click="adminAction('bookings/'+item.id,'PATCH',{status:'confirmed'},'Запись подтверждена.')">Подтвердить</button>
              <button class="secondary" :disabled="saving" @click="openMove(item)">Перенести</button>
              <button class="secondary danger" :disabled="saving" @click="adminAction('bookings/'+item.id,'PATCH',{status:'cancelled'},'Запись отменена.')">Отменить</button>
            </div>
          </article>
        </section>
      </div>
      <aside class="panel summary">
        <span class="section-tag"><Icon name="clock" :size="16"/> НАСТРОЙКИ</span><h2>Рабочие часы</h2><p class="muted">На {{ fullDate(day) }}</p>
        <form @submit.prevent="adminAction('hours','PUT',{day,opening,closing},'Рабочие часы сохранены.')">
          <div class="fields"><label>Открытие<select v-model="opening" :disabled="loading||saving"><option v-for="m in minutes" :key="m" :value="m">{{ clock(m) }}</option></select></label><label>Закрытие<select v-model="closing" :disabled="loading||saving"><option v-for="m in minutes" :key="m" :value="m">{{ clock(m) }}</option></select></label></div>
          <p class="muted">Одинаковое время открытия и закрытия обозначает выходной.</p>
          <button class="primary submit" :disabled="loading||saving">Сохранить график <Icon name="check" :size="17"/></button>
        </form>
      </aside>
    </div>
    <div v-if="moving" class="overlay" @click.self="!saving && closeMove()" @keydown.esc="!saving && closeMove()">
      <section class="panel modal" role="dialog" aria-modal="true" aria-labelledby="move-title">
        <h2 id="move-title">Перенос записи</h2><p class="muted">{{ byId(moving.service)?.name }} · {{ moving.car }}</p>
        <label>Новая дата<input type="date" :value="moveDay" :min="firstDay" :max="lastDay" required :disabled="saving" @change="changeDate($event, 'move')"></label>
        <p class="muted" v-if="moveLoading">Загружаем время…</p><p class="muted" v-else-if="!moveSlots.length">Свободных окон нет.</p>
        <div v-else class="slots"><button v-for="time in moveSlots" :key="time" :disabled="saving" :aria-pressed="time===moveStart" @click="moveStart=time">{{ clock(time) }}</button></div>
        <p v-if="moveError" class="error" role="alert">{{ moveError }}</p>
        <div class="actions"><button class="primary" :disabled="moveStart===null||saving" @click="adminAction('bookings/'+moving.id,'PATCH',{day:moveDay,start:moveStart},'Запись перенесена.')">Сохранить</button><button class="secondary" :disabled="saving" @click="closeMove">Закрыть</button></div>
      </section>
    </div>
  </template>
</main>
<footer class="wrap footer"><span>ПИТСТОП <b> / </b> ДЕМО-ПРОЕКТ</span><span>Онлайн-запись и календарь автосервиса</span></footer>
</template>
