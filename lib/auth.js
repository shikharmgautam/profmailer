import crypto from 'crypto';
import { getDb, saveDb } from './db.js';

const SESSION_COOKIE_NAME = 'prof_session';
const SESSION_DURATION_DAYS = 30;

/**
 * Hash a password using scrypt with a random salt.
 * Native Node.js crypto, zero external dependencies, cross-platform.
 */
export function hashPassword(password) {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a non-empty string');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verify a plain-text password against a stored hash using timing-safe comparison.
 */
export function verifyPassword(password, storedHash) {
  if (!password || !storedHash || typeof storedHash !== 'string' || !storedHash.includes(':')) {
    return false;
  }
  try {
    const [salt, key] = storedHash.split(':');
    const keyBuffer = Buffer.from(key, 'hex');
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(keyBuffer, derivedKey);
  } catch (e) {
    console.error('Password verification error:', e);
    return false;
  }
}

/**
 * Generate a cryptographically secure random session token.
 */
export function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create a session in the database for the given user.
 */
export async function createSession(userId) {
  const db = await getDb();
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const createdAt = new Date().toISOString();

  db.run(
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`,
    [token, Number(userId), createdAt, expiresAt]
  );
  saveDb();

  return { token, userId, expiresAt };
}

/**
 * Invalidate a session by token.
 */
export async function deleteSession(token) {
  if (!token) return;
  const db = await getDb();
  db.run(`DELETE FROM sessions WHERE token = ?`, [token]);
  saveDb();
}

/**
 * Authenticate an incoming Next.js API Request.
 * Returns the authenticated user record (without password_hash), or null if invalid.
 */
export async function authenticateRequest(request) {
  if (!request) return null;

  let token = null;

  // 1. From prof_session cookie
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/prof_session=([^;]+)/);
  if (match) {
    try {
      token = decodeURIComponent(match[1].trim());
    } catch {}
  }

  // 2. From Authorization: Bearer <token>
  if (!token) {
    const authHeader = request.headers.get('authorization') || '';
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    }
  }

  if (!token) return null;

  const db = await getDb();
  const stmt = db.prepare(`
    SELECT s.token, s.user_id, s.expires_at,
           u.id, u.name, u.email, u.education, u.target_degree, u.skills, u.projects,
           u.background, u.research_interests, u.default_template, u.updated_at
    FROM sessions s
    JOIN user_profile u ON s.user_id = u.id
    WHERE s.token = ? AND datetime(s.expires_at) > datetime('now')
  `);
  stmt.bind([token]);

  let user = null;
  if (stmt.step()) {
    user = stmt.getAsObject();
  }
  stmt.free();

  if (user) {
    // Standardize id as string and number
    user.userId = String(user.id);
    return user;
  }

  return null;
}

/**
 * Attach the session cookie to an existing Response object or Headers.
 */
export function attachSessionCookie(response, token) {
  const isProd = process.env.NODE_ENV === 'production';
  const maxAge = SESSION_DURATION_DAYS * 24 * 60 * 60;
  const cookieVal = `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${isProd ? '; Secure' : ''}`;
  response.headers.append('Set-Cookie', cookieVal);
  return response;
}

/**
 * Clear the session cookie on logout.
 */
export function clearSessionCookie(response) {
  response.headers.append(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`
  );
  return response;
}

