import { DatabaseSync } from 'node:sqlite'
// Local operator command. No HTTP endpoint exposes these contacts.
const db = new DatabaseSync(process.env.MAX_BOT_DB || './private/max-bot.sqlite', {readOnly: true})
console.log(JSON.stringify(db.prepare('SELECT id,user_id,data,created FROM leads ORDER BY id DESC LIMIT 100').all().map(row => ({...row, data: JSON.parse(row.data)})), null, 2))
db.close()
