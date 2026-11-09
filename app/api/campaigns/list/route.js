import { listCampaigns } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';

export async function GET(request) {
  const user = await authenticateRequest(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
  }

  // Authorization: Only return campaigns created by the authenticated user
  const campaigns = await listCampaigns(user.id);
  return Response.json(campaigns);
}
