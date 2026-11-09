import { getCampaign, updateCampaign } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';

export async function POST(request, { params }) {
  const user = await authenticateRequest(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
  }

  const { id } = await params;

  const campaign = await getCampaign(id);
  if (!campaign) return Response.json({ error: 'Campaign not found' }, { status: 404 });

  if (campaign.user_id && String(campaign.user_id) !== String(user.id)) {
    return Response.json({ error: 'Forbidden. You do not own this campaign.' }, { status: 403 });
  }

  if (['sent', 'sending', 'cancelled'].includes(campaign.status)) {
    return Response.json({ error: `Cannot cancel a campaign with status "${campaign.status}"` }, { status: 409 });
  }

  await updateCampaign(id, { status: 'cancelled' });

  return Response.json({ success: true, status: 'cancelled' });
}
