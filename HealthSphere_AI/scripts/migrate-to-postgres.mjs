#!/usr/bin/env node
/**
 * HealthSphere AI — JSON to local PostgreSQL Migration Script
 * 
 * Prerequisites:
 *   1. PostgreSQL running on localhost:5432
 *   2. Database 'healthsphere' created
 *   3. .env file with PG_* variables (see .env.example)
 * 
 * Usage:
 *   PG_DATABASE=healthsphere node scripts/migrate-to-postgres.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.HealthSphere_DATA_DIR || process.env.DATA_DIR || path.join(ROOT, 'backend', 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

const { Client } = pg;

/* Helper: read a field accepting both camelCase and snake_case keys */
function g(obj, camel, snake) {
  if (!obj) return null;
  return obj[camel] ?? obj[snake] ?? null;
}

async function main() {
  console.log('[migrate] Starting JSON → local Postgres migration');
  console.log('[migrate] Reading from:', DB_PATH);

  if (!fs.existsSync(DB_PATH)) {
    console.error('[migrate] JSON database not found at', DB_PATH);
    process.exit(1);
  }

  const json = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  console.log('[migrate] Loaded JSON, users:', json.users?.length || 0);

  const client = new Client({
    host: process.env.PG_HOST || '127.0.0.1',
    port: Number(process.env.PG_PORT || 5432),
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || 'postgres',
    database: process.env.PG_DATABASE || 'healthsphere',
    ssl: false
  });

  await client.connect();
  console.log('[migrate] Connected to local Postgres');

  await client.query('BEGIN');

  try {
    /* 1. Users */
    console.log('[migrate] Migrating users...');
    for (const u of json.users || []) {
      await client.query(`
        INSERT INTO users (id, email, name, passwordSalt, passwordHash, createdAt, consent)
        VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
        ON CONFLICT (id) DO UPDATE SET
          email=EXCLUDED.email, name=EXCLUDED.name, passwordSalt=EXCLUDED.passwordSalt,
          passwordHash=EXCLUDED.passwordHash, createdAt=EXCLUDED.createdAt, consent=EXCLUDED.consent
      `, [
        u.id, u.email, u.name,
        g(u, 'passwordSalt', 'password_hash'),
        g(u, 'passwordHash', 'password_hash'),
        g(u, 'createdAt', 'created_at'),
        JSON.stringify(u.consent || {})
      ]);
    }

    /* 2. Sessions */
    console.log('[migrate] Migrating sessions...');
    for (const s of json.sessions || []) {
      await client.query(`
        INSERT INTO sessions (token, userId, createdAt, expiresAt)
        VALUES ($1,$2,$3,$4)
        ON CONFLICT (token) DO NOTHING
      `, [
        s.token,
        g(s, 'userId', 'user_id'),
        g(s, 'createdAt', 'created_at'),
        g(s, 'expiresAt', 'expires_at')
      ]);
    }

    /* 3-12. Per-user JSONB collections */
    const collections = [
      ['profiles', json.profiles],
      ['families', json.families],
      ['reports', json.reports],
      ['metrics', json.metrics],
      ['logs', json.logs],
      ['plans', json.plans],
      ['doctors', json.doctors],
      ['contacts', json.contacts],
      ['reminders', json.reminders],
      ['settings', json.settings],
      ['sos', json.sos],
      ['audit', json.audit]
    ];

    for (const [collName, data] of collections) {
      console.log(`[migrate] Migrating ${collName}...`);
      for (const [userId, items] of Object.entries(data || {})) {
        await client.query(`
          INSERT INTO user_collections (userId, collection, data, updatedAt)
          VALUES ($1, $2, $3::jsonb, NOW())
          ON CONFLICT (userId, collection) DO UPDATE SET
            data = EXCLUDED.data, updatedAt = NOW()
        `, [userId, collName, JSON.stringify(items || null)]);
      }
    }

    /* 13. Doctor accounts */
    console.log('[migrate] Migrating doctor accounts...');
    for (const d of json.doctorAccounts || []) {
      await client.query(`
        INSERT INTO doctor_accounts (id, email, name, passwordSalt, passwordHash, qualification, specialization, verificationStatus, availabilityStatus, createdAt)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (id) DO UPDATE SET
          email=EXCLUDED.email, name=EXCLUDED.name, passwordSalt=EXCLUDED.passwordSalt,
          passwordHash=EXCLUDED.passwordHash, qualification=EXCLUDED.qualification,
          specialization=EXCLUDED.specialization
      `, [
        d.id, d.email, d.name,
        g(d, 'passwordSalt', 'password_hash'),
        g(d, 'passwordHash', 'password_hash'),
        d.qualification || '', d.specialization || '',
        d.verificationStatus || 'pending', d.availabilityStatus || 'offline',
        g(d, 'createdAt', 'created_at') || new Date().toISOString()
      ]);
    }

    /* 14. Store owner accounts */
    console.log('[migrate] Migrating store owner accounts...');
    for (const o of json.storeOwnerAccounts || []) {
      await client.query(`
        INSERT INTO store_owner_accounts (id, email, ownerName, storeName, storeId, passwordSalt, passwordHash, createdAt)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (id) DO UPDATE SET
          email=EXCLUDED.email, ownerName=EXCLUDED.ownerName, storeName=EXCLUDED.storeName
      `, [
        o.id, o.email, o.ownerName, o.storeName, o.storeId,
        g(o, 'passwordSalt', 'password_hash'),
        g(o, 'passwordHash', 'password_hash'),
        g(o, 'createdAt', 'created_at') || new Date().toISOString()
      ]);
    }

    /* 15. Stores */
    console.log('[migrate] Migrating stores...');
    for (const s of json.stores || []) {
      await client.query(`
        INSERT INTO stores (id, ownerId, name, address, phone, licenseNumber, inventory, createdAt)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (id) DO NOTHING
      `, [
        s.id, g(s, 'ownerId', 'owner_id'), s.name || '', s.address || '', s.phone || '',
        g(s, 'licenseNumber', 'license_number'),
        s.inventory || [],
        g(s, 'createdAt', 'created_at') || new Date().toISOString()
      ]);
    }

    /* 16. Consult tickets */
    console.log('[migrate] Migrating consult tickets...');
    for (const t of json.consultTickets || []) {
      await client.query(`
        INSERT INTO consult_tickets (id, patientId, doctorId, subject, status, priority, createdAt)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (id) DO NOTHING
      `, [
        t.id, g(t, 'patientId', 'patient_id'), g(t, 'doctorId', 'doctor_id'),
        t.subject || '', t.status || 'open', t.priority || 'normal',
        g(t, 'createdAt', 'created_at') || new Date().toISOString()
      ]);
    }

    /* 17. Consult appointments */
    console.log('[migrate] Migrating consult appointments...');
    for (const a of json.consultAppointments || []) {
      await client.query(`
        INSERT INTO consult_appointments (id, ticketId, doctorId, patientId, scheduledAt, durationMin, status, meetingLink, createdAt)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (id) DO NOTHING
      `, [
        a.id, g(a, 'ticketId', 'ticket_id'), g(a, 'doctorId', 'doctor_id'), g(a, 'patientId', 'patient_id'),
        g(a, 'scheduledAt', 'scheduled_at'), a.durationMin || 15, a.status || 'scheduled',
        g(a, 'meetingLink', 'meeting_link'), g(a, 'createdAt', 'created_at') || new Date().toISOString()
      ]);
    }

    /* 18. Consult messages */
    console.log('[migrate] Migrating consult messages...');
    for (const [ticketId, messages] of Object.entries(json.consultMessages || {})) {
      for (const m of messages) {
        await client.query(`
          INSERT INTO consult_messages (id, ticketId, senderId, senderRole, content, attachments, createdAt)
          VALUES ($1,$2,$3,$4,$5,$6,$7)
          ON CONFLICT (id) DO NOTHING
        `, [
          m.id, ticketId,
          g(m, 'senderId', 'sender_id'),
          g(m, 'senderRole', 'sender_role'),
          m.content,
          m.attachments || [],
          g(m, 'createdAt', 'created_at') || new Date().toISOString()
        ]);
      }
    }

    /* 19. Feedback */
    console.log('[migrate] Migrating feedback...');
    for (const f of json.feedback || []) {
      await client.query(`
        INSERT INTO feedback (id, userId, userEmail, type, message, page, status, ts)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (id) DO NOTHING
      `, [
        f.id,
        g(f, 'userId', 'user_id'),
        g(f, 'userEmail', 'user_email'),
        f.type, f.message, f.page || '', f.status || 'open',
        g(f, 'ts') || new Date().toISOString()
      ]);
    }

    await client.query('COMMIT');
    console.log('[migrate] ✅ Migration committed successfully');

    const tables = [
      'users', 'sessions', 'profiles', 'families', 'reports', 'metrics', 'logs',
      'plans', 'doctors', 'contacts', 'reminders', 'settings', 'sos', 'audit',
      'doctor_accounts', 'store_owner_accounts', 'stores',
      'consult_tickets', 'consult_appointments', 'consult_messages', 'feedback'
    ];

    console.log('\n[migrate] Verification counts:');
    for (const table of tables) {
      let count;
      if (['profiles', 'families', 'reports', 'metrics', 'logs', 'plans', 'doctors', 'contacts', 'reminders', 'settings', 'sos', 'audit'].includes(table)) {
        const res = await client.query(`SELECT COUNT(*) FROM user_collections WHERE collection = $1`, [table]);
        count = res.rows[0].count;
      } else {
        const pgName = {
          doctorAccounts: 'doctor_accounts',
          storeOwnerAccounts: 'store_owner_accounts',
          consultTickets: 'consult_tickets',
          consultAppointments: 'consult_appointments',
          consultMessages: 'consult_messages',
        }[table] || table;
        const res = await client.query(`SELECT COUNT(*) FROM ${pgName}`);
        count = res.rows[0].count;
      }
      console.log(`  ${table}: ${count}`);
    }

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[migrate] ❌ Migration failed, rolled back:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
