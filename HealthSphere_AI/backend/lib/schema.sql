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
  role      TEXT DEFAULT 'patient',
  createdat TIMESTAMPTZ,
  expiresat TIMESTAMPTZ
);

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'patient';

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
  licensenumber     TEXT DEFAULT '',
  idproof           TEXT DEFAULT '',
  yearsexp          INTEGER DEFAULT 0,
  fee               NUMERIC DEFAULT 0,
  verificationstatus TEXT DEFAULT 'pending',
  availabilitystatus TEXT DEFAULT 'offline',
  createdat         TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS store_owner_accounts (
  id                 TEXT PRIMARY KEY,
  email              TEXT UNIQUE NOT NULL,
  ownername          TEXT,
  storename          TEXT,
  storeid            TEXT,
  passwordsalt       TEXT,
  passwordhash       TEXT,
  licensenumber      TEXT DEFAULT '',
  address            TEXT DEFAULT '',
  contact            TEXT DEFAULT '',
  hours              TEXT DEFAULT '',
  photos             JSONB DEFAULT '[]'::jsonb,
  verificationstatus TEXT DEFAULT 'pending',
  createdat          TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS stores (
  id            TEXT PRIMARY KEY,
  ownerid       TEXT,
  name          TEXT,
  category      TEXT DEFAULT 'Pharmacy',
  address       TEXT,
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  hours         TEXT DEFAULT '',
  contact       TEXT DEFAULT '',
  phone         TEXT,
  licensenumber TEXT,
  photos        JSONB DEFAULT '[]'::jsonb,
  logo          TEXT DEFAULT '',
  offers        JSONB DEFAULT '[]'::jsonb,
  products      JSONB DEFAULT '[]'::jsonb,
  inventory     JSONB DEFAULT '[]'::jsonb,
  status        TEXT DEFAULT 'pending',
  views         INTEGER DEFAULT 0,
  clicks        INTEGER DEFAULT 0,
  createdat     TIMESTAMPTZ
);

-- Bring databases created by earlier schema versions up to date.
ALTER TABLE doctor_accounts ADD COLUMN IF NOT EXISTS licensenumber TEXT DEFAULT '';
ALTER TABLE doctor_accounts ADD COLUMN IF NOT EXISTS idproof TEXT DEFAULT '';
ALTER TABLE doctor_accounts ADD COLUMN IF NOT EXISTS yearsexp INTEGER DEFAULT 0;
ALTER TABLE doctor_accounts ADD COLUMN IF NOT EXISTS fee NUMERIC DEFAULT 0;

ALTER TABLE store_owner_accounts ADD COLUMN IF NOT EXISTS licensenumber TEXT DEFAULT '';
ALTER TABLE store_owner_accounts ADD COLUMN IF NOT EXISTS address TEXT DEFAULT '';
ALTER TABLE store_owner_accounts ADD COLUMN IF NOT EXISTS contact TEXT DEFAULT '';
ALTER TABLE store_owner_accounts ADD COLUMN IF NOT EXISTS hours TEXT DEFAULT '';
ALTER TABLE store_owner_accounts ADD COLUMN IF NOT EXISTS photos JSONB DEFAULT '[]'::jsonb;
ALTER TABLE store_owner_accounts ADD COLUMN IF NOT EXISTS verificationstatus TEXT DEFAULT 'pending';

ALTER TABLE stores ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Pharmacy';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS hours TEXT DEFAULT '';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS contact TEXT DEFAULT '';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS photos JSONB DEFAULT '[]'::jsonb;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS logo TEXT DEFAULT '';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS offers JSONB DEFAULT '[]'::jsonb;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS products JSONB DEFAULT '[]'::jsonb;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS clicks INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS consult_tickets (
  id          TEXT PRIMARY KEY,
  patientid   TEXT,
  patientname TEXT,
  doctorid    TEXT,
  subject     TEXT,
  specialization TEXT,
  symptoms    TEXT,
  urgency     TEXT,
  preferreddoctorid TEXT,
  preferreddoctorname TEXT,
  preferredslots JSONB DEFAULT '[]'::jsonb,
  assigneddoctorid TEXT,
  status      TEXT DEFAULT 'open',
  priority    TEXT DEFAULT 'normal',
  expiresat   TIMESTAMPTZ,
  createdat   TIMESTAMPTZ
);

ALTER TABLE consult_tickets ADD COLUMN IF NOT EXISTS patientname TEXT;
ALTER TABLE consult_tickets ADD COLUMN IF NOT EXISTS specialization TEXT;
ALTER TABLE consult_tickets ADD COLUMN IF NOT EXISTS symptoms TEXT;
ALTER TABLE consult_tickets ADD COLUMN IF NOT EXISTS urgency TEXT;
ALTER TABLE consult_tickets ADD COLUMN IF NOT EXISTS preferreddoctorid TEXT;
ALTER TABLE consult_tickets ADD COLUMN IF NOT EXISTS preferreddoctorname TEXT;
ALTER TABLE consult_tickets ADD COLUMN IF NOT EXISTS preferredslots JSONB DEFAULT '[]'::jsonb;
ALTER TABLE consult_tickets ADD COLUMN IF NOT EXISTS assigneddoctorid TEXT;
ALTER TABLE consult_tickets ADD COLUMN IF NOT EXISTS expiresat TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS consult_appointments (
  id             TEXT PRIMARY KEY,
  ticketid       TEXT,
  doctorid       TEXT,
  patientid      TEXT,
  doctorname     TEXT,
  patientname    TEXT,
  confirmedslot  TIMESTAMPTZ,
  scheduledat    TIMESTAMPTZ,
  durationmin    INTEGER DEFAULT 15,
  status         TEXT DEFAULT 'scheduled',
  meetinglink    TEXT DEFAULT '',
  sessionlink    TEXT DEFAULT '',
  sessionid      TEXT DEFAULT '',
  createdat      TIMESTAMPTZ
);

ALTER TABLE consult_appointments ADD COLUMN IF NOT EXISTS doctorname TEXT;
ALTER TABLE consult_appointments ADD COLUMN IF NOT EXISTS patientname TEXT;
ALTER TABLE consult_appointments ADD COLUMN IF NOT EXISTS confirmedslot TIMESTAMPTZ;
ALTER TABLE consult_appointments ADD COLUMN IF NOT EXISTS sessionlink TEXT DEFAULT '';
ALTER TABLE consult_appointments ADD COLUMN IF NOT EXISTS sessionid TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS consult_messages (
  id         TEXT PRIMARY KEY,
  ticketid   TEXT,
  appointmentid TEXT,
  senderid   TEXT,
  sendername TEXT,
  senderrole TEXT,
  content    TEXT,
  text       TEXT,
  attachments JSONB DEFAULT '[]'::jsonb,
  ts         TIMESTAMPTZ,
  createdat  TIMESTAMPTZ
);

ALTER TABLE consult_messages ADD COLUMN IF NOT EXISTS appointmentid TEXT;
ALTER TABLE consult_messages ADD COLUMN IF NOT EXISTS sendername TEXT;
ALTER TABLE consult_messages ADD COLUMN IF NOT EXISTS text TEXT;
ALTER TABLE consult_messages ADD COLUMN IF NOT EXISTS ts TIMESTAMPTZ;

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
