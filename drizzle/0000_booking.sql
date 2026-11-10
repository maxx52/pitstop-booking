CREATE TABLE bookings (
  id TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  start INTEGER NOT NULL,
  finish INTEGER NOT NULL,
  service TEXT NOT NULL,
  name TEXT NOT NULL,
  car TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','confirmed','cancelled'))
);
--> statement-breakpoint
CREATE INDEX booking_calendar ON bookings(day,start,finish) WHERE status != 'cancelled';
--> statement-breakpoint
CREATE TABLE hours (
  day TEXT PRIMARY KEY,
  opening INTEGER NOT NULL,
  closing INTEGER NOT NULL
);
