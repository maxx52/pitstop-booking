import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'

export function localDatabase(path) {
  const db = new DatabaseSync(path)
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE name='bookings'").get()) {
    db.exec(readFileSync(new URL('../drizzle/0000_booking.sql',import.meta.url),'utf8'))
  }
  return {
    prepare(query) {
      const statement = db.prepare(query)
      return {bind: (...args) => ({
        first: async () => statement.get(...args),
        all: async () => ({results:statement.all(...args)}),
        run: async () => ({meta:statement.run(...args)})
      })}
    },
    close: () => db.close()
  }
}
