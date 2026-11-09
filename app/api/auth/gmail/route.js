import { getAuthUrl } from '@/lib/gmail';
import { getUserIdFromRequest } from '@/lib/user-auth';

export async function GET(request) {
  try {
    const userId = getUserIdFromRequest(request);
    const url = getAuthUrl(userId);
    return Response.redirect(url);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
