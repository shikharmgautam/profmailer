import { authenticateRequest } from '@/lib/auth';

export async function GET(request) {
  try {
    const user = await authenticateRequest(request);
    if (!user) {
      return Response.json({ authenticated: false, user: null }, { status: 401 });
    }

    return Response.json({
      authenticated: true,
      user
    });
  } catch (err) {
    console.error('Auth me error:', err);
    return Response.json({ authenticated: false, error: err.message }, { status: 500 });
  }
}

