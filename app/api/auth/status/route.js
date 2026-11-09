import { getGmailStatus } from '@/lib/gmail';

export async function GET() {
  try {
    const status = await getGmailStatus();
    return Response.json(status);
  } catch (err) {
    return Response.json({ connected: false, error: err.message });
  }
}
