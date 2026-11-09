import { exchangeCodeForTokens } from '@/lib/gmail';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return new Response(`
      <html><body style="font-family:sans-serif;padding:40px;">
        <h2>❌ Gmail Authorization Failed</h2>
        <p>${error}</p>
        <a href="/">← Back to Dashboard</a>
      </body></html>
    `, { headers: { 'Content-Type': 'text/html' } });
  }

  if (!code) {
    return Response.json({ error: 'No authorization code received' }, { status: 400 });
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    return new Response(`
      <html><body style="font-family:sans-serif;padding:40px;">
        <h2>✅ Gmail Connected Successfully!</h2>
        <p>Connected as: <strong>${tokens.gmail_address}</strong></p>
        <p>You can now close this window and return to the app.</p>
        <script>setTimeout(() => window.location.href = '/', 2000);</script>
        <a href="/">← Back to Dashboard</a>
      </body></html>
    `, { headers: { 'Content-Type': 'text/html' } });
  } catch (err) {
    return new Response(`
      <html><body style="font-family:sans-serif;padding:40px;">
        <h2>❌ Failed to connect Gmail</h2>
        <p>${err.message}</p>
        <a href="/">← Back to Dashboard</a>
      </body></html>
    `, { headers: { 'Content-Type': 'text/html' } });
  }
}
