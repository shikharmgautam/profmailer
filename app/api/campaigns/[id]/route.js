import { getCampaign, listCampaigns } from '@/lib/db';

export async function GET(request, { params }) {
  const { id } = await params;
  if (id === 'list') {
    const campaigns = await listCampaigns();
    return Response.json(campaigns);
  }
  const campaign = await getCampaign(id);
  if (!campaign) {
    return Response.json({ error: 'Campaign not found' }, { status: 404 });
  }
  return Response.json(campaign);
}
