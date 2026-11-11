const callback = (text, payload) => ({type: 'callback', text, payload})
const keyboard = buttons => [{type: 'inline_keyboard', payload: {buttons}}]
export const menu = keyboard([
  [{type: 'open_app', text: 'Попробовать запись', web_app: 'se14970930_bot'}],
  [callback('Возможности', 'features')],
  [callback('Примеры', 'examples'), callback('Условия', 'terms')],
  [callback('Запросить расчёт', 'quote')]
])
const cancel = keyboard([[callback('Отменить заявку', 'cancel')]])
const welcome = 'Здравствуйте! Это PitStop от студии «Импульс». Клиенты выбирают услугу и время с телефона, а администратор управляет записями. Попробуйте демо или запросите настройку для своего автосервиса.'
const questions = {
  service: 'Как называется ваш автосервис?',
  city: 'В каком городе работает автосервис?',
  posts: 'Сколько сервисных постов нужно подключить? Введите число от 1 до 100.',
  wishes: 'Какие услуги и пожелания нужно учесть? Если пожеланий нет, напишите «Нет».',
  contact: 'Как с вами связаться для расчёта? Укажите рабочий телефон, email или ник в мессенджере.'
}
const fields = Object.keys(questions)

// Pure transition: persistence and delivery are handled by the webhook service.
export function transition(update, previous) {
  const message = update.message
  const user = update.user ?? update.callback?.user ?? message?.sender
  if (!user || user.is_bot || !Number.isSafeInteger(user.user_id)) return null
  if (message && message.recipient?.chat_type !== 'dialog') return null
  const userId = user.user_id
  const command = update.update_type === 'message_callback'
    ? update.callback?.payload : message?.body?.text?.trim()
  const state = previous ?? {step: null, data: {}}
  const reply = (text, attachments = cancel, next = state, lead = null) =>
    ({userId, state: next, reply: {text, attachments}, lead})
  const empty = {step: null, data: {}}
  if (update.update_type === 'bot_started' || ['/start', '/menu', 'Меню', 'cancel'].includes(command)) {
    return reply(command === 'cancel' ? 'Заполнение отменено. Выберите действие.' : welcome, menu, empty)
  }
  if (command === 'features') return reply(
    'PitStop позволяет выбирать услугу и свободное время, указывать автомобиль и контактный телефон. Администратор подтверждает, переносит и отменяет записи, меняет рабочие часы. Под ваш сервис можно настроить услуги, расписание и оформление. Стоимость рассчитываем после уточнения задачи.', menu, empty)
  if (command === 'examples') return reply(
    'Демо PitStop показывает запись на услугу, выбор свободного времени и заполнение данных автомобиля. Откройте форму и попробуйте записаться с телефона. Для вашего автосервиса можно обсудить оформление с логотипом и фирменными цветами, список услуг и рабочий график.\n\nДемо: https://pitstop.maxxdev.ru', menu, empty)
  if (command === 'terms') return reply(
    'Подключение PitStop\n\n1. Уточняем услуги, график, количество постов и пожелания.\n2. Согласуем состав работ, стоимость и сроки.\n3. Настраиваем оформление и сценарий записи.\n4. Вместе проверяем работу и запускаем сервис.\n\nПоддержка и дальнейшие доработки обсуждаются отдельно. Чтобы получить предложение под ваш автосервис, нажмите «Запросить расчёт».', menu, empty)
  if (command === 'quote') return reply(
    'Для расчёта понадобятся данные сервиса и контакт для ответа. Указывайте только те сведения, которые готовы передать студии «Импульс» для обсуждения подключения. Продолжить?',
    keyboard([[callback('Продолжить', 'quote_begin')], [callback('В меню', 'cancel')]]), empty)
  if (command === 'quote_begin') return reply(questions.service, cancel, {step: 'service', data: {}})
  if (update.update_type !== 'message_created') return null
  if (!state.step) return reply('Выберите действие в меню. Для расчёта нажмите «Запросить расчёт».', menu, empty)
  const text = message?.body?.text?.trim()
  const maximum = state.step === 'wishes' ? 1000 : 160
  if (!text || text.length > maximum) return reply(`Введите текст длиной от 1 до ${maximum} символов.\n${questions[state.step]}`)
  if (state.step === 'posts' && !/^(?:[1-9]|[1-9]\d|100)$/.test(text)) return reply(questions.posts)
  const data = {...state.data, [state.step]: text}
  const next = fields[fields.indexOf(state.step) + 1]
  if (next) return reply(questions[next], cancel, {step: next, data})
  return reply('Заявка на расчёт сохранена. Студия «Импульс» свяжется с вами по указанному контакту, чтобы уточнить задачу и стоимость.', menu, empty, data)
}
