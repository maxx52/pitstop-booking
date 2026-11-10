export const services = [
  { id: 'oil', name: 'Замена масла', price: 1200, duration: 30, icon: 'oil', description: 'Масло и масляный фильтр' },
  { id: 'tires', name: 'Шиномонтаж', price: 2500, duration: 60, icon: 'wheel', description: 'Замена и балансировка колёс' },
  { id: 'scan', name: 'Диагностика', price: 1500, duration: 60, icon: 'scan', description: 'Компьютерная проверка автомобиля' },
  { id: 'brakes', name: 'Замена колодок', price: 2200, duration: 90, icon: 'brakes', description: 'Работа с тормозами одной оси' },
]
export const money = value => new Intl.NumberFormat('ru-RU').format(value) + ' ₽'
export const clock = minute => String(Math.floor(minute / 60)).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0')
export const today = () => new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Novosibirsk'}).format(new Date())
export const dateAt = (day, offset) => {
  const date = new Date(day + 'T12:00:00Z')
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}
