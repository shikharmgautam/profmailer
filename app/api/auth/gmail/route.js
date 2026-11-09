import { getAuthUrl } from '@/lib/gmail';

export async function GET() {
  try {
    const url = getAuthUrl();
    return Response.redirect(url);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
