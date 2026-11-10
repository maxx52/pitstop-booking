import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'

export function localDatabase(path) {
  const db = new DatabaseSync(path)
  db.exec('BEGIN IMMEDIATE')
  try {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE name='bookings'").get()) {
      db.exec(readFileSync(new URL('../drizzle/0000_booking.sql', import.meta.url), 'utf8'))
    }
    const columns = db.prepare('PRAGMA table_info(bookings)').all()
    if (!columns.some(column => column.name === 'plate')) {
      db.exec(readFileSync(new URL('../drizzle/0001_booking_contact.sql', import.meta.url), 'utf8'))
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    db.close()
    throw error
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
