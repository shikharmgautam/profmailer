import { getCampaign } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';

export async function GET(request, { params }) {
  const user = await authenticateRequest(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
  }

  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) {
    return Response.json({ error: 'Campaign not found' }, { status: 404 });
  }

  // Authorization: Only owner can view the campaign
  if (campaign.user_id && String(campaign.user_id) !== String(user.id)) {
    return Response.json({ error: 'Forbidden. You do not have access to this campaign.' }, { status: 403 });
  }

  return Response.json(campaign);
}
