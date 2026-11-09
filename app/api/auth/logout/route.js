import { deleteSession, clearSessionCookie } from '@/lib/auth';

export async function POST(request) {
  try {
    const cookieHeader = request.headers.get('cookie') || '';
    const match = cookieHeader.match(/prof_session=([^;]+)/);
    if (match) {
      try {
        const token = decodeURIComponent(match[1].trim());
        await deleteSession(token);
      } catch {}
    }

    const res = Response.json({ success: true, message: 'Logged out successfully.' });
    clearSessionCookie(res);
    return res;
  } catch (err) {
    console.error('Logout error:', err);
    return Response.json({ error: 'Logout failed.' }, { status: 500 });
  }
}

