import { v4 as uuidv4 } from 'uuid';
import { getCampaign, updateCampaign, createScheduledJob, getUserProfile } from '@/lib/db';
import { sendEmail } from '@/lib/gmail';
import { startScheduler } from '@/lib/scheduler';

startScheduler();

export async function POST(request, { params }) {
  const { id } = await params;
  const body = await request.json();
  const { action, scheduledSendAt, recipientEmail, editedBody, editedSubject } = body;

  if (!['send_now', 'schedule'].includes(action)) {
    return Response.json({ error: 'action must be send_now or schedule' }, { status: 400 });
  }

  const campaign = await getCampaign(id);
  if (!campaign) return Response.json({ error: 'Campaign not found' }, { status: 404 });

  // Only allow approval if campaign is in a reviewable state
  const approvableStatuses = ['awaiting_approval', 'needs_clarification', 'failed'];
  if (!approvableStatuses.includes(campaign.status)) {
    return Response.json(
      { error: `Cannot approve a campaign with status "${campaign.status}". Already processed.` },
      { status: 409 }
    );
  }

  const finalRecipient = (recipientEmail || campaign.recipient_email || '').trim();
  if (!finalRecipient) {
    return Response.json(
      { error: 'Recipient email is required. Please enter it in the "To:" field.' },
      { status: 400 }
    );
  }

  // Validate email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(finalRecipient)) {
    return Response.json({ error: 'Invalid recipient email address.' }, { status: 400 });
  }

  const finalBody = (editedBody || campaign.personalized_body || '').trim();
  const finalSubject = (editedSubject || campaign.personalized_subject || '').trim();

  if (!finalBody || !finalSubject) {
    return Response.json({ error: 'Email body and subject are required.' }, { status: 400 });
  }

  const approvedAt = new Date().toISOString();

  if (action === 'send_now') {
    // Record approval then send immediately
    await updateCampaign(id, {
      approved_at: approvedAt,
      approved_body: finalBody,
      approved_subject: finalSubject,
      recipient_email: finalRecipient,
      status: 'sending',
    });

    try {
      const profile = await getUserProfile();
      const result = await sendEmail({
        to: finalRecipient,
        subject: finalSubject,
        body: finalBody,
        fromName: profile?.name || undefined,
      });

      const sentAt = new Date().toISOString();
      await updateCampaign(id, {
        status: 'sent',
        sent_at: sentAt,
        message_id: result.messageId,
        send_result: { success: true, messageId: result.messageId, sentAt },
      });

      return Response.json({ success: true, status: 'sent', messageId: result.messageId, sentAt });
    } catch (err) {
      await updateCampaign(id, {
        status: 'failed',
        error_message: err.message,
        send_result: { success: false, error: err.message },
      });
      return Response.json({ error: err.message, status: 'failed' }, { status: 500 });
    }
  }

  // action === 'schedule'
  if (!scheduledSendAt) {
    return Response.json({ error: 'scheduledSendAt is required for scheduled sending.' }, { status: 400 });
  }

  const sendDate = new Date(scheduledSendAt);
  if (isNaN(sendDate.getTime()) || sendDate <= new Date()) {
    return Response.json({ error: 'scheduledSendAt must be a valid future date.' }, { status: 400 });
  }

  await updateCampaign(id, {
    approved_at: approvedAt,
    approved_body: finalBody,
    approved_subject: finalSubject,
    recipient_email: finalRecipient,
    status: 'approved_scheduled',
    scheduled_send_at: sendDate.toISOString(),
  });

  const jobId = uuidv4();
  await createScheduledJob(jobId, id, sendDate.toISOString());

  return Response.json({
    success: true,
    status: 'approved_scheduled',
    jobId,
    scheduledFor: sendDate.toISOString(),
  });
}
