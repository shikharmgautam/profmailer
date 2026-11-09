import { getCampaign, updateCampaign } from '@/lib/db';

export async function POST(request, { params }) {
  const { id } = await params;

  const campaign = await getCampaign(id);
  if (!campaign) return Response.json({ error: 'Campaign not found' }, { status: 404 });

  if (['sent', 'sending', 'cancelled'].includes(campaign.status)) {
    return Response.json({ error: `Cannot cancel a campaign with status "${campaign.status}"` }, { status: 409 });
  }

  await updateCampaign(id, { status: 'cancelled' });

  return Response.json({ success: true, status: 'cancelled' });
}
