import { google } from 'googleapis';
import { getGmailTokens, saveGmailTokens } from './db.js';

export function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI || 'http://localhost:3000/api/auth/gmail/callback'
  );
}

export function getAuthUrl() {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
  });
}

export async function exchangeCodeForTokens(code) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  // Get user email
  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const userInfo = await oauth2.userinfo.get();
  tokens.gmail_address = userInfo.data.email;

  await saveGmailTokens(tokens);
  return tokens;
}

export async function getAuthenticatedClient() {
  const stored = await getGmailTokens();
  if (!stored || !stored.access_token) {
    throw new Error('Gmail not connected. Please connect your Gmail account first.');
  }

  const client = getOAuthClient();
  client.setCredentials({
    access_token: stored.access_token,
    refresh_token: stored.refresh_token,
    token_type: stored.token_type,
    expiry_date: stored.expiry_date,
  });

  // Auto-refresh if expired
  client.on('tokens', async (newTokens) => {
    const current = await getGmailTokens();
    await saveGmailTokens({
      ...current,
      ...newTokens,
    });
  });

  return client;
}

/**
 * Send an email via the Gmail API.
 * Returns { messageId, threadId }
 */
export async function sendEmail({ to, subject, body, fromName }) {
  const client = await getAuthenticatedClient();
  const gmail = google.gmail({ version: 'v1', auth: client });

  const stored = await getGmailTokens();
  const from = fromName
    ? `"${fromName}" <${stored.gmail_address}>`
    : stored.gmail_address;

  // Build RFC 2822 message
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    `MIME-Version: 1.0`,
    '',
    body,
  ].join('\r\n');

  const encoded = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const result = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encoded },
  });

  return {
    messageId: result.data.id,
    threadId: result.data.threadId,
    labelIds: result.data.labelIds,
  };
}

export async function getGmailStatus() {
  const stored = await getGmailTokens();
  if (!stored || !stored.access_token) {
    return { connected: false, email: null };
  }
  return { connected: true, email: stored.gmail_address };
}
