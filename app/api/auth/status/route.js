import { getGmailStatus } from '@/lib/gmail';
import { getUserIdFromRequest } from '@/lib/user-auth';

export async function GET(request) {
  try {
    const userId = getUserIdFromRequest(request);
    const status = await getGmailStatus(userId);
    return Response.json(status);
  } catch (err) {
    return Response.json({ connected: false, error: err.message });
  }
}
