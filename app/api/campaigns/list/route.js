import { listCampaigns } from '@/lib/db';
import { getUserIdFromRequest } from '@/lib/user-auth';

export async function GET(request) {
  const userId = getUserIdFromRequest(request);
  const campaigns = await listCampaigns(userId);
  return Response.json(campaigns);
}
