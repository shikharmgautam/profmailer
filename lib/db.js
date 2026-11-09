import initSqlJs from 'sql.js';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'app.db');

let _db = null;
let _SQL = null;

async function getSql() {
  if (_SQL) return _SQL;
  _SQL = await initSqlJs();
  return _SQL;
}

export async function getDb() {
  if (_db) return _db;

  const SQL = await getSql();
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (fs.existsSync(/*turbopackIgnore: true*/ DB_PATH)) {
    const fileBuffer = fs.readFileSync(/*turbopackIgnore: true*/ DB_PATH);
    _db = new SQL.Database(fileBuffer);
  } else {
    _db = new SQL.Database();
  }

  initSchema(_db);
  saveDb(); // initial save
  return _db;
}

function saveDb() {
  if (!_db) return;
  try {
    const data = _db.export();
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  } catch(e) {
    console.error('DB save error:', e);
  }
}

function run(db, sql, params = []) {
  db.run(sql, params);
  saveDb();
}

function get(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function all(db, sql, params = []) {
  const results = [];
  const stmt = db.prepare(sql);
  stmt.bind(params);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function initSchema(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS user_profile (
      id INTEGER PRIMARY KEY,
      name TEXT,
      email TEXT,
      cv_text TEXT,
      background TEXT,
      research_interests TEXT,
      skills TEXT,
      education TEXT,
      projects TEXT,
      target_degree TEXT,
      default_template TEXT,
      updated_at TEXT
    );
  `);

  for (const col of ['skills TEXT', 'education TEXT', 'projects TEXT', 'target_degree TEXT']) {
    try { db.run(`ALTER TABLE user_profile ADD COLUMN ${col}`); } catch {}
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS gmail_tokens (
      id INTEGER PRIMARY KEY,
      access_token TEXT,
      refresh_token TEXT,
      token_type TEXT,
      expiry_date INTEGER,
      gmail_address TEXT,
      updated_at TEXT
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      professor_name TEXT NOT NULL,
      university TEXT NOT NULL,
      additional_instructions TEXT,
      professor_profile TEXT,
      research_data TEXT,
      verification_results TEXT,
      personalized_subject TEXT,
      personalized_body TEXT,
      recipient_email TEXT,
      recipient_email_source TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      progress_stage INTEGER DEFAULT 0,
      progress_message TEXT,
      error_message TEXT,
      approved_at TEXT,
      approved_body TEXT,
      approved_subject TEXT,
      scheduled_send_at TEXT,
      sent_at TEXT,
      send_result TEXT,
      message_id TEXT,
      created_at TEXT,
      updated_at TEXT
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS scheduled_jobs (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      scheduled_for TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      last_attempted_at TEXT,
      attempt_count INTEGER DEFAULT 0,
      result TEXT,
      created_at TEXT
    );
  `);

  // Default user profile
  const existing = get(db, 'SELECT id FROM user_profile WHERE id = 1');
  if (!existing) {
    db.run(`INSERT INTO user_profile (id, default_template, updated_at) VALUES (1, ?, datetime('now'))`, [
      `Dear Professor {professor_name},

I am writing to express my strong interest in your research group at {university}.

{research_personalization}

I would be grateful for the opportunity to discuss potential research or collaboration opportunities in your lab.

{user_background}

Thank you for your time and consideration.

Best regards,
{user_name}`
    ]);
  }
  saveDb();
}

// ── Campaign CRUD ──────────────────────────────────────────────

export async function createCampaign(data) {
  const db = await getDb();
  const now = new Date().toISOString();
  run(db, `
    INSERT INTO campaigns (id, professor_name, university, additional_instructions, status, progress_stage, progress_message, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'researching', 0, 'Starting research...', ?, ?)
  `, [data.id, data.professor_name, data.university, data.additional_instructions || null, now, now]);
}

export async function updateCampaign(id, fields) {
  const db = await getDb();
  const allowed = [
    'professor_profile', 'research_data', 'verification_results',
    'personalized_subject', 'personalized_body', 'recipient_email',
    'recipient_email_source', 'status', 'progress_stage', 'progress_message',
    'error_message', 'approved_at', 'approved_body', 'approved_subject',
    'scheduled_send_at', 'sent_at', 'send_result', 'message_id'
  ];
  const sets = [];
  const vals = [];
  for (const key of allowed) {
    if (key in fields && fields[key] !== undefined) {
      sets.push(`${key} = ?`);
      const v = fields[key];
      vals.push((v !== null && typeof v === 'object') ? JSON.stringify(v) : (v ?? null));
    }
  }
  if (!sets.length) return;
  sets.push("updated_at = ?");
  vals.push(new Date().toISOString());
  vals.push(id);
  run(db, `UPDATE campaigns SET ${sets.join(', ')} WHERE id = ?`, vals);
}

export async function getCampaign(id) {
  const db = await getDb();
  const row = get(db, 'SELECT * FROM campaigns WHERE id = ?', [id]);
  if (!row) return null;
  return parseCampaignJson(row);
}

export async function listCampaigns() {
  const db = await getDb();
  const rows = all(db, 'SELECT * FROM campaigns ORDER BY created_at DESC LIMIT 50');
  return rows.map(parseCampaignJson);
}

function parseCampaignJson(row) {
  for (const field of ['professor_profile', 'research_data', 'verification_results', 'send_result']) {
    if (row[field] && typeof row[field] === 'string') {
      try { row[field] = JSON.parse(row[field]); } catch {}
    }
  }
  return row;
}

// ── User Profile ───────────────────────────────────────────────

export async function getUserProfile() {
  const db = await getDb();
  return get(db, 'SELECT * FROM user_profile WHERE id = 1');
}

export async function updateUserProfile(fields) {
  const db = await getDb();
  const allowed = [
    'name', 'email', 'cv_text', 'background', 'research_interests',
    'default_template', 'skills', 'education', 'projects', 'target_degree'
  ];
  const sets = [];
  const vals = [];
  for (const key of allowed) {
    if (key in fields && fields[key] !== undefined) {
      sets.push(`${key} = ?`);
      vals.push(fields[key] ?? null);
    }
  }
  if (!sets.length) return;
  sets.push("updated_at = ?");
  vals.push(new Date().toISOString());
  run(db, `UPDATE user_profile SET ${sets.join(', ')} WHERE id = 1`, vals);
}

// ── Gmail Tokens ───────────────────────────────────────────────

export async function getGmailTokens() {
  const db = await getDb();
  return get(db, 'SELECT * FROM gmail_tokens WHERE id = 1');
}

export async function saveGmailTokens(tokens) {
  const db = await getDb();
  const existing = get(db, 'SELECT id FROM gmail_tokens WHERE id = 1');
  const now = new Date().toISOString();
  if (existing) {
    run(db, `UPDATE gmail_tokens SET access_token=?,refresh_token=?,token_type=?,expiry_date=?,gmail_address=?,updated_at=? WHERE id=1`,
      [tokens.access_token, tokens.refresh_token || null, tokens.token_type, tokens.expiry_date, tokens.gmail_address || null, now]);
  } else {
    run(db, `INSERT INTO gmail_tokens (id,access_token,refresh_token,token_type,expiry_date,gmail_address,updated_at) VALUES (1,?,?,?,?,?,?)`,
      [tokens.access_token, tokens.refresh_token || null, tokens.token_type, tokens.expiry_date, tokens.gmail_address || null, now]);
  }
}

// ── Scheduled Jobs ─────────────────────────────────────────────

export async function createScheduledJob(id, campaignId, scheduledFor) {
  const db = await getDb();
  const now = new Date().toISOString();
  run(db, `INSERT INTO scheduled_jobs (id,campaign_id,scheduled_for,status,attempt_count,created_at) VALUES (?,?,?,'pending',0,?)`,
    [id, campaignId, scheduledFor, now]);
}

export async function getPendingJobs() {
  const db = await getDb();
  const now = new Date().toISOString();
  return all(db, `
    SELECT j.id as job_id, j.campaign_id, j.scheduled_for, j.attempt_count, j.status as job_status,
           c.id, c.professor_name, c.university, c.status, c.approved_body, c.approved_subject,
           c.recipient_email, c.message_id, c.approved_at
    FROM scheduled_jobs j
    JOIN campaigns c ON c.id = j.campaign_id
    WHERE j.status = 'pending' AND j.scheduled_for <= ? AND j.attempt_count < 3
  `, [now]);
}

export async function updateJob(id, fields) {
  const db = await getDb();
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    sets.push(`${k} = ?`);
    vals.push(typeof v === 'object' ? JSON.stringify(v) : v);
  }
  vals.push(id);
  run(db, `UPDATE scheduled_jobs SET ${sets.join(', ')} WHERE id = ?`, vals);
}
