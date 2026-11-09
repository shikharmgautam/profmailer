/**
 * Helper to extract active user ID from HTTP request (via headers, cookies, or query).
 */
export function getUserIdFromRequest(request) {
  if (!request) return '1';

  // 1. Check custom header (sent by frontend client fetch)
  const headerId = request.headers.get('x-user-id');
  if (headerId && headerId.trim()) return headerId.trim();

  // 2. Check prof_user_id cookie
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/prof_user_id=([^;]+)/);
  if (match && match[1].trim()) {
    try {
      return decodeURIComponent(match[1].trim());
    } catch {}
  }

  // 3. Check query param ?userId=...
  try {
    const url = new URL(request.url);
    const queryId = url.searchParams.get('userId');
    if (queryId && queryId.trim()) return queryId.trim();
  } catch {}

  // 4. Default user
  return '1';
}

