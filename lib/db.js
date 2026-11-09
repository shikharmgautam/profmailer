import initSqlJs from 'sql.js';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_EMAIL_TEMPLATE, EMAIL_PRESET_TEMPLATES } from './templates.js';

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'app.db');

let _db = null;
let _SQL = null;
let _saveTimeout = null;

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
  saveDb(true); // initial synchronous save
  return _db;
}

/**
 * Concurrency-safe, debounced save with atomic rename to prevent corruption
 * during simultaneous multi-user requests.
 */
export function saveDb(immediate = false) {
  if (!_db) return;
  if (!immediate) {
    if (_saveTimeout) clearTimeout(_saveTimeout);
    _saveTimeout = setTimeout(() => flushDb(), 60);
    return;
  }
  flushDb();
}

function flushDb() {
  if (!_db) return;
  try {
    const data = _db.export();
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tempPath = `${DB_PATH}.tmp.${Date.now()}`;
    fs.writeFileSync(tempPath, Buffer.from(data));
    fs.renameSync(tempPath, DB_PATH);
  } catch (e) {
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
      id TEXT PRIMARY KEY,
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
      id TEXT PRIMARY KEY,
      user_id TEXT DEFAULT '1',
      access_token TEXT,
      refresh_token TEXT,
      token_type TEXT,
      expiry_date INTEGER,
      gmail_address TEXT,
      updated_at TEXT
    );
  `);

  try { db.run(`ALTER TABLE gmail_tokens ADD COLUMN user_id TEXT DEFAULT '1'`); } catch {}

  db.run(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      user_id TEXT DEFAULT '1',
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

  try { db.run(`ALTER TABLE campaigns ADD COLUMN user_id TEXT DEFAULT '1'`); } catch {}

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

  // Default seed profiles for multi-user collaboration
  const user1 = get(db, 'SELECT id, default_template FROM user_profile WHERE id = "1"');
  if (!user1) {
    db.run(`INSERT INTO user_profile (id, name, email, education, target_degree, skills, projects, background, research_interests, default_template, updated_at) VALUES ('1', ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`, [
      'Tharun Aadesh',
      'tharunaadesh.maharavi@gmail.com',
      'B.Tech in Instrumentation and Control Engineering, National Institute of Technology-Tiruchirappalli',
      'Research Internship',
      'Verilog, C, C++, Python, LabVIEW, Sentaurus TCAD, MATLAB, Vivado, Tina, Proteus',
      'Condition Monitoring of turbines using Zynq-7000 SoC; Implementation of MSK and QPSK modulation in PXIe FPGA card; Comparative Analysis of Digital Modulation Techniques using LabVIEW',
      'Undergraduate student at NIT Trichy with hands-on experience in FPGA design and RF communication systems. Completed a research internship at the Centre for Airborne Systems (DRDO) focusing on real-time datalink testing, EVM and BER performance analysis, and simulation frameworks.',
      'FPGA-based digital signal processing, RF communication systems, device-level simulation, semiconductor design, embedded SoC systems',
      DEFAULT_EMAIL_TEMPLATE
    ]);
  } else if (!user1.default_template || user1.default_template.includes('{research_personalization}')) {
    db.run(`UPDATE user_profile SET default_template = ?, updated_at = datetime('now') WHERE id = '1'`, [
      DEFAULT_EMAIL_TEMPLATE
    ]);
  }

  // Seed sample team profile: Vaibhav Kannan (User 2)
  const userVaibhav = get(db, 'SELECT id FROM user_profile WHERE id = 2');
  if (!userVaibhav) {
    db.run(`INSERT INTO user_profile (id, name, email, education, target_degree, skills, projects, background, research_interests, default_template, updated_at) VALUES (2, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`, [
      'Vaibhav Kannan',
      'vaibhav.kannan@gmail.com',
      'B.Tech in Metallurgical and Materials Engineering, NIT Trichy',
      'Research Internship',
      'ANSYS ACP, SolidWorks, MATLAB, Material Characterization (SEM, XRD, Tensile Testing)',
      'High-performance polymer matrix composites for UAV applications at DRDO (ADE); Bamboo fibre-reinforced composites and ANSYS ACP structural analysis at IIT Madras',
      'Third-year undergraduate at NIT Trichy. Completed research attachments at DRDO ADE and IIT Madras, focusing on composites processing and structural dynamics modeling.',
      'Multiphysics behaviour, structural dynamics, multiscale mechanics, integrated material systems',
      EMAIL_PRESET_TEMPLATES[0].template
    ]);
  }

  // Seed sample team profile: Austadish Saikia (User 3)
  const userAustadish = get(db, 'SELECT id FROM user_profile WHERE id = 3');
  if (!userAustadish) {
    db.run(`INSERT INTO user_profile (id, name, email, education, target_degree, skills, projects, background, research_interests, default_template, updated_at) VALUES (3, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`, [
      'Austadish Saikia',
      'saikiaaustadish@gmail.com',
      'B.Tech in Instrumentation and Control Engineering, NIT Trichy',
      '1-Year Research Internship',
      'Cadence Virtuoso, SPICE, Analog Circuit Simulation, Layout, Verilog-A, MATLAB',
      '6-month engineering internship at Prodigy Technovations; Analog/mixed signal design flow (schematic, simulation, layout)',
      'Final-year undergraduate student at NIT Trichy keenly interested in analog and mixed-signal circuit design, pursuing pre-doctoral research ahead of graduate studies.',
      'Analog/mixed signal circuit design, low-power analog VLSI, sensor interface ICs',
      EMAIL_PRESET_TEMPLATES[1].template
    ]);
  }

  saveDb(true);
}

// ── Multi-User Profile CRUD ────────────────────────────────────

export async function listUserProfiles() {
  const db = await getDb();
  return all(db, 'SELECT id, name, email, education, target_degree, updated_at FROM user_profile ORDER BY updated_at DESC');
}

export async function getUserProfile(userId = '1') {
  const db = await getDb();
  const idStr = String(userId || '1');
  const idNum = parseInt(idStr, 10);
  let user = null;
  if (!isNaN(idNum)) {
    user = get(db, 'SELECT * FROM user_profile WHERE id = ?', [idNum]);
  }
  if (!user) {
    user = get(db, 'SELECT * FROM user_profile WHERE id = ?', [idStr]);
  }
  if (user) return user;
  // Fallback to first user
  return get(db, 'SELECT * FROM user_profile ORDER BY id ASC LIMIT 1');
}

export async function createUserProfile(fields) {
  const db = await getDb();
  const now = new Date().toISOString();
  const template = fields.default_template || DEFAULT_EMAIL_TEMPLATE;

  if (fields.id && /^\d+$/.test(String(fields.id))) {
    const numericId = parseInt(String(fields.id), 10);
    run(db, `
      INSERT INTO user_profile (
        id, name, email, cv_text, background, research_interests,
        skills, education, projects, target_degree, default_template, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      numericId,
      fields.name || 'New Member',
      fields.email || null,
      fields.cv_text || null,
      fields.background || null,
      fields.research_interests || null,
      fields.skills || null,
      fields.education || null,
      fields.projects || null,
      fields.target_degree || 'Research Internship',
      template,
      now
    ]);
    return getUserProfile(numericId);
  } else {
    run(db, `
      INSERT INTO user_profile (
        name, email, cv_text, background, research_interests,
        skills, education, projects, target_degree, default_template, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      fields.name || 'New Member',
      fields.email || null,
      fields.cv_text || null,
      fields.background || null,
      fields.research_interests || null,
      fields.skills || null,
      fields.education || null,
      fields.projects || null,
      fields.target_degree || 'Research Internship',
      template,
      now
    ]);
    const row = get(db, 'SELECT last_insert_rowid() as id');
    return getUserProfile(row?.id || 1);
  }
}

export async function updateUserProfile(fields, userId = '1') {
  const db = await getDb();
  const idStr = String(userId || '1');
  const idNum = parseInt(idStr, 10);
  const targetId = !isNaN(idNum) ? idNum : idStr;
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
  vals.push(targetId);
  run(db, `UPDATE user_profile SET ${sets.join(', ')} WHERE id = ?`, vals);
  return getUserProfile(targetId);
}

export async function deleteUserProfile(userId) {
  const db = await getDb();
  const idStr = String(userId);
  const idNum = parseInt(idStr, 10);
  const targetId = !isNaN(idNum) ? idNum : idStr;
  if (idStr === '1' || targetId === 1) throw new Error('Cannot delete primary default profile');
  run(db, 'DELETE FROM user_profile WHERE id = ?', [targetId]);
  run(db, 'DELETE FROM campaigns WHERE user_id = ? OR user_id = ?', [idStr, String(targetId)]);
  run(db, 'DELETE FROM gmail_tokens WHERE user_id = ? OR user_id = ?', [idStr, String(targetId)]);
}

// ── Campaign CRUD ──────────────────────────────────────────────

export async function createCampaign(data) {
  const db = await getDb();
  const now = new Date().toISOString();
  const userId = String(data.user_id || '1');
  run(db, `
    INSERT INTO campaigns (id, user_id, professor_name, university, additional_instructions, status, progress_stage, progress_message, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'researching', 0, 'Starting research...', ?, ?)
  `, [data.id, userId, data.professor_name, data.university, data.additional_instructions || null, now, now]);
}

export async function updateCampaign(id, fields) {
  const db = await getDb();
  const allowed = [
    'user_id', 'professor_profile', 'research_data', 'verification_results',
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

export async function listCampaigns(userId = null) {
  const db = await getDb();
  if (userId) {
    const rows = all(db, 'SELECT * FROM campaigns WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', [String(userId)]);
    return rows.map(parseCampaignJson);
  }
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

// ── Multi-User Gmail Tokens ────────────────────────────────────

export async function getGmailTokens(userId = '1') {
  const db = await getDb();
  const idStr = String(userId || '1');
  const token = get(db, 'SELECT * FROM gmail_tokens WHERE user_id = ?', [idStr]);
  if (token) return token;
  // Fallback for backwards compatibility
  return get(db, 'SELECT * FROM gmail_tokens WHERE id = ? OR id = "1"', [idStr]);
}

export async function saveGmailTokens(tokens, userId = '1') {
  const db = await getDb();
  const idStr = String(userId || '1');
  const existing = get(db, 'SELECT id FROM gmail_tokens WHERE user_id = ? OR id = ?', [idStr, idStr]);
  const now = new Date().toISOString();
  if (existing) {
    run(db, `UPDATE gmail_tokens SET access_token=?,refresh_token=?,token_type=?,expiry_date=?,gmail_address=?,updated_at=? WHERE id=?`,
      [tokens.access_token, tokens.refresh_token || null, tokens.token_type, tokens.expiry_date, tokens.gmail_address || null, now, existing.id]);
  } else {
    run(db, `INSERT INTO gmail_tokens (id,user_id,access_token,refresh_token,token_type,expiry_date,gmail_address,updated_at) VALUES (?,?,?,?,?,?,?,?)`,
      [idStr, idStr, tokens.access_token, tokens.refresh_token || null, tokens.token_type, tokens.expiry_date, tokens.gmail_address || null, now]);
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
           c.id, c.user_id, c.professor_name, c.university, c.status, c.approved_body, c.approved_subject,
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
