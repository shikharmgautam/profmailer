import { getGmailStatus } from '@/lib/gmail';
import { authenticateRequest } from '@/lib/auth';

export async function GET(request) {
  try {
    const user = await authenticateRequest(request);
    if (!user) {
      return Response.json({ connected: false, error: 'Unauthorized' }, { status: 401 });
    }
    const status = await getGmailStatus(user.id);
    return Response.json(status);
  } catch (err) {
    return Response.json({ connected: false, error: err.message });
  }
}
