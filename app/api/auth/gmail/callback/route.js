import { exchangeCodeForTokens } from '@/lib/gmail';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const userId = searchParams.get('state') || '1';

  if (error) {
    return new Response(`
      <html><body style="font-family:sans-serif;padding:40px;background:#0d1117;color:#c9d1d9;">
        <h2>❌ Gmail Authorization Failed</h2>
        <p>${error}</p>
        <a href="/" style="color:#58a6ff;">← Back to Dashboard</a>
      </body></html>
    `, { headers: { 'Content-Type': 'text/html' } });
  }

  if (!code) {
    return Response.json({ error: 'No authorization code received' }, { status: 400 });
  }

  try {
    const tokens = await exchangeCodeForTokens(code, userId);
    return new Response(`
      <html><body style="font-family:sans-serif;padding:40px;background:#0d1117;color:#c9d1d9;">
        <h2>✅ Gmail Connected Successfully!</h2>
        <p>Connected account: <strong>${tokens.gmail_address}</strong></p>
        <p>Your emails will now be sent securely from your personal Gmail address.</p>
        <script>setTimeout(() => window.location.href = '/', 2000);</script>
        <a href="/" style="color:#58a6ff;">← Return to App</a>
      </body></html>
    `, { headers: { 'Content-Type': 'text/html' } });
  } catch (err) {
    return new Response(`
      <html><body style="font-family:sans-serif;padding:40px;background:#0d1117;color:#c9d1d9;">
        <h2>❌ Failed to connect Gmail</h2>
        <p>${err.message}</p>
        <a href="/" style="color:#58a6ff;">← Back to Dashboard</a>
      </body></html>
    `, { headers: { 'Content-Type': 'text/html' } });
  }
}
