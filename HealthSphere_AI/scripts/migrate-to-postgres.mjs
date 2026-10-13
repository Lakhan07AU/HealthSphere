#!/usr/bin/env node
/**
 * HealthSphere AI — JSON to Postgres Migration Script
 * 
 * Usage:
 *   SUPABASE_DB_URL=postgresql://... node scripts/migrate-to-postgres.mjs
 * 
 * Run AFTER creating the schema (see PRODUCTION_PLAN.md for DDL)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { uid } from '../backend/lib/util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.HealthSphere_DATA_DIR || process.env.DATA_DIR || path.join(ROOT, 'backend', 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

const { Client } = pg;

async function main() {
  console.log('[migrate] Starting JSON → Postgres migration');
  console.log('[migrate] Reading from:', DB_PATH);
  
  if (!fs.existsSync(DB_PATH)) {
    console.error('[migrate] JSON database not found at', DB_PATH);
    process.exit(1);
  }
  
  const json = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  console.log('[migrate] Loaded JSON, users:', json.users?.length || 0);
  
  if (!process.env.SUPABASE_DB_URL) {
    console.error('[migrate] SUPABASE_DB_URL not set');
    process.exit(1);
  }
  
  const client = new Client({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  await client.connect();
  console.log('[migrate] Connected to Postgres');
  
  // Start transaction
  await client.query('BEGIN');
  
  try {
    // 1. Users
    console.log('[migrate] Migrating users...');
    for (const u of json.users || []) {
      await client.query(`
        INSERT INTO users (id, email, name, password_salt, password_hash, created_at, mfa_secret, mfa_enabled, backup_codes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (id) DO UPDATE SET
          email=EXCLUDED.email, name=EXCLUDED.name, password_salt=EXCLUDED.password_salt,
          password_hash=EXCLUDED.password_hash, created_at=EXCLUDED.created_at
      `, [u.id, u.email, u.name, u.passwordSalt, u.passwordHash, u.createdAt, null, false, null]);
    }
    
    // 2. Sessions
    console.log('[migrate] Migrating sessions...');
    for (const s of json.sessions || []) {
      await client.query(`
        INSERT INTO sessions (token, user_id, role, created_at, expires_at)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (token) DO NOTHING
      `, [s.token, s.userId, s.role || 'patient', s.createdAt, s.expiresAt]);
    }
    
    // 3. Profiles
    console.log('[migrate] Migrating profiles...');
    for (const [userId, p] of Object.entries(json.profiles || {})) {
      await client.query(`
        INSERT INTO profiles (user_id, dob, sex, height_cm, weight_kg, blood_group, allergies, conditions, medications, goals, food_preference, restrictions, lifestyle, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (user_id) DO UPDATE SET
          dob=EXCLUDED.dob, sex=EXCLUDED.sex, height_cm=EXCLUDED.height_cm, weight_kg=EXCLUDED.weight_kg,
          blood_group=EXCLUDED.blood_group, allergies=EXCLUDED.allergies, conditions=EXCLUDED.conditions,
          medications=EXCLUDED.medications, goals=EXCLUDED.goals, food_preference=EXCLUDED.food_preference,
          restrictions=EXCLUDED.restrictions, lifestyle=EXCLUDED.lifestyle
      `, [userId, p.dob || null, p.sex || null, p.heightCm || null, p.weightKg || null, p.bloodGroup || null,
          p.allergies || [], p.conditions || [], p.medications || [], p.goals || [],
          p.foodPreference || null, p.restrictions || [], p.lifestyle || {}, p._createdAt || new Date().toISOString()]);
    }
    
    // 4. Family members
    console.log('[migrate] Migrating family members...');
    for (const [userId, members] of Object.entries(json.families || {})) {
      for (const m of members) {
        await client.query(`
          INSERT INTO family_members (id, user_id, relation, name, age_or_year, conditions, surgeries, cancer_history, genetic_conditions, events, notes, recorded_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
          ON CONFLICT (id) DO NOTHING
        `, [m.id, userId, m.relation, m.name || '', m.ageOrYear || '', m.conditions || [], m.surgeries || [], m.cancerHistory || false, m.geneticConditions || [], m.events || [], m.notes || '', m.recordedAt || new Date().toISOString()]);
      }
    }
    
    // 5. Reports
    console.log('[migrate] Migrating reports...');
    for (const [userId, reports] of Object.entries(json.reports || {})) {
      for (const r of reports) {
        await client.query(`
          INSERT INTO reports (id, user_id, filename, stored_name, mime, size, uploaded_at, status, pipeline, structured, summary_text, file_backend, cloud_public_id, file_resource_type, file_data)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
          ON CONFLICT (id) DO NOTHING
        `, [r.id, userId, r.filename, r.storedName, r.mime, r.size, r.uploadedAt, r.status, r.pipeline || [], r.structured || {tests:[]}, r.summaryText || '', r.fileBackend || null, r.cloudPublicId || null, r.fileResourceType || null, r.fileData || null]);
      }
    }
    
    // 6. Metrics
    console.log('[migrate] Migrating metrics...');
    let metricCount = 0;
    for (const [userId, metrics] of Object.entries(json.metrics || {})) {
      for (const m of metrics) {
        await client.query(`
          INSERT INTO metrics (id, user_id, key, value, unit, date, source, flag, label)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          ON CONFLICT (id) DO NOTHING
        `, [m.id, userId, m.key, m.value, m.unit || '', m.date, m.source || 'manual', m.flag || null, m.label || null]);
        metricCount++;
      }
    }
    console.log(`[migrate] Migrated ${metricCount} metrics`);
    
    // 7. Lifestyle logs
    console.log('[migrate] Migrating lifestyle logs...');
    for (const [userId, logs] of Object.entries(json.logs || {})) {
      for (const l of logs) {
        await client.query(`
          INSERT INTO lifestyle_logs (id, user_id, type, value, date, created_at)
          VALUES ($1,$2,$3,$4,$5,$6)
          ON CONFLICT (id) DO NOTHING
        `, [l.id, userId, l.type, l.value, l.date, l.createdAt || new Date().toISOString()]);
      }
    }
    
    // 8. Plans
    console.log('[migrate] Migrating plans...');
    for (const [userId, plan] of Object.entries(json.plans || {})) {
      await client.query(`
        INSERT INTO plans (user_id, activity, nutrition, updated_at)
        VALUES ($1,$2,$3,$4)
        ON CONFLICT (user_id) DO UPDATE SET
          activity=EXCLUDED.activity, nutrition=EXCLUDED.nutrition, updated_at=EXCLUDED.updated_at
      `, [userId, plan.activity || null, plan.nutrition || null, new Date().toISOString()]);
    }
    
    // 9. Doctors (care team)
    console.log('[migrate] Migrating doctors...');
    for (const [userId, doctors] of Object.entries(json.doctors || {})) {
      for (const d of doctors) {
        await client.query(`
          INSERT INTO doctors (id, user_id, name, role, specialty, phone, clinic, notes, added_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          ON CONFLICT (id) DO NOTHING
        `, [d.id, userId, d.name, d.role || 'Specialist', d.specialty || '', d.phone || '', d.clinic || '', d.notes || '', d.addedAt || new Date().toISOString()]);
      }
    }
    
    // 10. Contacts
    console.log('[migrate] Migrating contacts...');
    for (const [userId, contacts] of Object.entries(json.contacts || {})) {
      for (const c of contacts) {
        await client.query(`
          INSERT INTO contacts (id, user_id, name, relation, phone, notes, priority, created_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          ON CONFLICT (id) DO NOTHING
        `, [c.id, userId, c.name, c.relation || 'Other', c.phone, c.notes || '', c.priority || 2, c.createdAt || new Date().toISOString()]);
      }
    }
    
    // 11. Reminders
    console.log('[migrate] Migrating reminders...');
    for (const [userId, reminders] of Object.entries(json.reminders || {})) {
      for (const r of reminders) {
        await client.query(`
          INSERT INTO reminders (id, user_id, title, type, due_date, recurrence, status, metadata, created_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          ON CONFLICT (id) DO NOTHING
        `, [r.id, userId, r.title, r.type || 'once', r.dueDate || null, r.recurrence || null, r.status || 'active', r.metadata || {}, r.createdAt || new Date().toISOString()]);
      }
    }
    
    // 12. Settings
    console.log('[migrate] Migrating settings...');
    for (const [userId, s] of Object.entries(json.settings || {})) {
      await client.query(`
        INSERT INTO settings (user_id, consents, notifications, privacy, updated_at)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (user_id) DO UPDATE SET
          consents=EXCLUDED.consents, notifications=EXCLUDED.notifications, privacy=EXCLUDED.privacy, updated_at=EXCLUDED.updated_at
      `, [userId, s.consents || {}, s.notifications || {}, s.privacy || {}, new Date().toISOString()]);
    }
    
    // 13. SOS alerts
    console.log('[migrate] Migrating SOS alerts...');
    for (const [userId, alerts] of Object.entries(json.sos || {})) {
      for (const a of alerts) {
        await client.query(`
          INSERT INTO sos_alerts (id, user_id, ts, status, has_location, message, cancelled_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7)
          ON CONFLICT (id) DO NOTHING
        `, [a.id, userId, a.ts, a.status || 'active', a.hasLocation || false, a.message || '', a.cancelledAt || null]);
      }
    }
    
    // 14. Audit logs
    console.log('[migrate] Migrating audit logs...');
    let auditCount = 0;
    for (const [userId, audits] of Object.entries(json.audit || {})) {
      for (const a of audits) {
        await client.query(`
          INSERT INTO audit_logs (user_id, action, detail, ts)
          VALUES ($1,$2,$3,$4)
        `, [userId, a.action, a.detail || '', a.ts]);
        auditCount++;
      }
    }
    console.log(`[migrate] Migrated ${auditCount} audit entries`);
    
    // 15. Doctor accounts
    console.log('[migrate] Migrating doctor accounts...');
    for (const d of json.doctorAccounts || []) {
      await client.query(`
        INSERT INTO doctor_accounts (id, email, name, password_salt, password_hash, qualification, specialization, verification_status, availability_status, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (id) DO UPDATE SET
          email=EXCLUDED.email, name=EXCLUDED.name, password_salt=EXCLUDED.password_salt, password_hash=EXCLUDED.password_hash
      `, [d.id, d.email, d.name, d.passwordSalt, d.passwordHash, d.qualification || '', d.specialization || '', d.verificationStatus || 'pending', d.availabilityStatus || 'offline', d.createdAt || new Date().toISOString()]);
    }
    
    // 16. Store owner accounts
    console.log('[migrate] Migrating store owner accounts...');
    for (const o of json.storeOwnerAccounts || []) {
      await client.query(`
        INSERT INTO store_owner_accounts (id, email, owner_name, store_name, store_id, password_salt, password_hash, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (id) DO UPDATE SET
          email=EXCLUDED.email, owner_name=EXCLUDED.owner_name, store_name=EXCLUDED.store_name
      `, [o.id, o.email, o.ownerName, o.storeName, o.storeId, o.passwordSalt, o.passwordHash, o.createdAt || new Date().toISOString()]);
    }
    
    // 17. Stores
    console.log('[migrate] Migrating stores...');
    for (const s of json.stores || []) {
      await client.query(`
        INSERT INTO stores (id, owner_id, name, address, phone, license_number, inventory, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (id) DO NOTHING
      `, [s.id, s.ownerId, s.name || '', s.address || '', s.phone || '', s.licenseNumber || '', s.inventory || [], s.createdAt || new Date().toISOString()]);
    }
    
    // 18. Consult tickets
    console.log('[migrate] Migrating consult tickets...');
    for (const t of json.consultTickets || []) {
      await client.query(`
        INSERT INTO consult_tickets (id, patient_id, doctor_id, subject, status, priority, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (id) DO NOTHING
      `, [t.id, t.patientId, t.doctorId || null, t.subject || '', t.status || 'open', t.priority || 'normal', t.createdAt || new Date().toISOString()]);
    }
    
    // 19. Consult appointments
    console.log('[migrate] Migrating consult appointments...');
    for (const a of json.consultAppointments || []) {
      await client.query(`
        INSERT INTO consult_appointments (id, ticket_id, doctor_id, patient_id, scheduled_at, duration_min, status, meeting_link, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (id) DO NOTHING
      `, [a.id, a.ticketId, a.doctorId, a.patientId, a.scheduledAt, a.durationMin || 15, a.status || 'scheduled', a.meetingLink || '', a.createdAt || new Date().toISOString()]);
    }
    
    // 20. Consult messages
    console.log('[migrate] Migrating consult messages...');
    for (const [ticketId, messages] of Object.entries(json.consultMessages || {})) {
      for (const m of messages) {
        await client.query(`
          INSERT INTO consult_messages (id, ticket_id, sender_id, sender_role, content, attachments, created_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7)
          ON CONFLICT (id) DO NOTHING
        `, [m.id, ticketId, m.senderId, m.senderRole, m.content, m.attachments || [], m.createdAt || new Date().toISOString()]);
      }
    }
    
    // 21. Feedback
    console.log('[migrate] Migrating feedback...');
    for (const f of json.feedback || []) {
      await client.query(`
        INSERT INTO feedback (id, user_id, user_email, type, message, page, status, ts)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (id) DO NOTHING
      `, [f.id, f.userId, f.userEmail, f.type, f.message, f.page || '', f.status || 'open', f.ts || new Date().toISOString()]);
    }
    
    // Commit
    await client.query('COMMIT');
    console.log('[migrate] ✅ Migration committed successfully');
    
    // Verify counts
    const tables = [
      'users', 'sessions', 'profiles', 'family_members', 'reports',
      'metrics', 'lifestyle_logs', 'plans', 'doctors', 'contacts',
      'reminders', 'settings', 'sos_alerts', 'audit_logs',
      'doctor_accounts', 'store_owner_accounts', 'stores',
      'consult_tickets', 'consult_appointments', 'consult_messages',
      'feedback'
    ];
    
    console.log('\n[migrate] Verification counts:');
    for (const table of tables) {
      const res = await client.query(`SELECT COUNT(*) FROM ${table}`);
      console.log(`  ${table}: ${res.rows[0].count}`);
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