import { getAuthUrl } from '@/lib/gmail';
import { authenticateRequest } from '@/lib/auth';

export async function GET(request) {
  try {
    const user = await authenticateRequest(request);
    if (!user) {
      return Response.redirect(new URL('/login', request.url));
    }
    const url = getAuthUrl(user.id);
    return Response.redirect(url);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
