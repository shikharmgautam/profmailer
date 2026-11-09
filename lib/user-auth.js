import { authenticateRequest } from './auth.js';

/**
 * Returns authenticated user from session, or null if unauthenticated.
 */
export async function getAuthUser(request) {
  return await authenticateRequest(request);
}

/**
 * Helper to extract active user ID from HTTP request.
 * Prioritizes verified session auth, with legacy fallback.
 */
export async function getUserIdFromRequest(request) {
  const user = await authenticateRequest(request);
  if (user?.id) return String(user.id);

  if (request?.headers) {
    const cookieHeader = request.headers.get('cookie') || '';
    const match = cookieHeader.match(/prof_user_id=([^;]+)/);
    if (match) {
      try {
        const val = decodeURIComponent(match[1].trim());
        if (val) return val;
      } catch {}
    }
  }

  return '1';
}
