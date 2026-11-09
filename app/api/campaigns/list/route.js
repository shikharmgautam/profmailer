import { listCampaigns } from '@/lib/db';

export async function GET() {
  const campaigns = await listCampaigns();
  return Response.json(campaigns);
}
