-- HealthSphere AI — PostgreSQL Schema
-- Lowercase column names (PostgreSQL folds unquoted identifiers to lowercase).

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  name          TEXT,
  passwordsalt  TEXT,
  passwordhash  TEXT,
  createdat     TIMESTAMPTZ,
  consent       JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS sessions (
  token     TEXT PRIMARY KEY,
  userid    TEXT NOT NULL,
  createdat TIMESTAMPTZ,
  expiresat TIMESTAMPTZ
);

-- Per-user collections stored as JSONB blobs keyed by (userid, collection)
CREATE TABLE IF NOT EXISTS user_collections (
  userid     TEXT NOT NULL,
  collection TEXT NOT NULL,
  data       JSONB NOT NULL DEFAULT '[]'::jsonb,
  updatedat  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (userid, collection)
);

CREATE TABLE IF NOT EXISTS doctor_accounts (
  id                TEXT PRIMARY KEY,
  email             TEXT UNIQUE NOT NULL,
  name              TEXT,
  passwordsalt      TEXT,
  passwordhash      TEXT,
  qualification     TEXT,
  specialization    TEXT,
  verificationstatus TEXT DEFAULT 'pending',
  availabilitystatus TEXT DEFAULT 'offline',
  createdat         TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS store_owner_accounts (
  id           TEXT PRIMARY KEY,
  email        TEXT UNIQUE NOT NULL,
  ownername    TEXT,
  storename    TEXT,
  storeid      TEXT,
  passwordsalt TEXT,
  passwordhash TEXT,
  createdat    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS stores (
  id            TEXT PRIMARY KEY,
  ownerid       TEXT,
  name          TEXT,
  address       TEXT,
  phone         TEXT,
  licensenumber TEXT,
  inventory     JSONB DEFAULT '[]'::jsonb,
  createdat     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS consult_tickets (
  id          TEXT PRIMARY KEY,
  patientid   TEXT,
  doctorid    TEXT,
  subject     TEXT,
  status      TEXT DEFAULT 'open',
  priority    TEXT DEFAULT 'normal',
  createdat   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS consult_appointments (
  id             TEXT PRIMARY KEY,
  ticketid       TEXT,
  doctorid       TEXT,
  patientid      TEXT,
  scheduledat    TIMESTAMPTZ,
  durationmin    INTEGER DEFAULT 15,
  status         TEXT DEFAULT 'scheduled',
  meetinglink    TEXT DEFAULT '',
  createdat      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS consult_messages (
  id         TEXT PRIMARY KEY,
  ticketid   TEXT,
  senderid   TEXT,
  senderrole TEXT,
  content    TEXT,
  attachments JSONB DEFAULT '[]'::jsonb,
  createdat  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS feedback (
  id        TEXT PRIMARY KEY,
  userid    TEXT,
  useremail TEXT,
  type      TEXT,
  message   TEXT,
  page      TEXT DEFAULT '',
  status    TEXT DEFAULT 'open',
  ts        TIMESTAMPTZ
);
