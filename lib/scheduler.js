import cron from 'node-cron';
import { getPendingJobs, updateJob, updateCampaign } from './db.js';
import { sendEmail } from './gmail.js';

let _started = false;

export function startScheduler() {
  if (_started) return;
  _started = true;

  // Check for due jobs every minute
  cron.schedule('* * * * *', async () => {
    try {
      await processDueJobs();
    } catch (err) {
      console.error('[Scheduler] Error processing jobs:', err);
    }
  });

  console.log('[Scheduler] Started — checking for due jobs every minute.');
}

export async function processDueJobs() {
  const jobs = await getPendingJobs();
  if (jobs.length === 0) return;

  console.log(`[Scheduler] Processing ${jobs.length} due job(s).`);

  for (const job of jobs) {
    await processJob(job);
  }
}

async function processJob(job) {
  const jobId = job.job_id;
  const campaignId = job.campaign_id;

  // Safety checks
  if (job.status !== 'approved_scheduled' && job.status !== 'approved') {
    // Campaign must still be approved
    if (!['approved_scheduled', 'approved'].includes(job.status)) {
      await updateJob(jobId, { status: 'cancelled', result: 'Campaign no longer approved' });
      return;
    }
  }

  if (!job.approved_body || !job.approved_subject || !job.recipient_email) {
    await updateJob(jobId, { status: 'failed', result: 'Missing required email data' });
    await updateCampaign(campaignId, { status: 'failed', error_message: 'Missing email data at send time' });
    return;
  }

  // Idempotency: skip if already sent
  if (job.message_id) {
    await updateJob(jobId, { status: 'completed', result: 'Already sent: ' + job.message_id });
    return;
  }

  // Increment attempt count
  await updateJob(jobId, {
    attempt_count: (job.attempt_count || 0) + 1,
    last_attempted_at: new Date().toISOString(),
  });

  await updateCampaign(campaignId, { status: 'sending' });

  try {
    const result = await sendEmail({
      to: job.recipient_email,
      subject: job.approved_subject,
      body: job.approved_body,
    });

    const sentAt = new Date().toISOString();
    await updateJob(jobId, {
      status: 'completed',
      result: JSON.stringify({ success: true, messageId: result.messageId }),
    });
    await updateCampaign(campaignId, {
      status: 'sent',
      sent_at: sentAt,
      message_id: result.messageId,
      send_result: { success: true, messageId: result.messageId, sentAt },
    });

    console.log(`[Scheduler] Sent email for campaign ${campaignId}, Gmail messageId: ${result.messageId}`);
  } catch (err) {
    console.error(`[Scheduler] Failed to send campaign ${campaignId}:`, err.message);

    const attempts = (job.attempt_count || 0) + 1;
    const failed = attempts >= 3;

    await updateJob(jobId, {
      status: failed ? 'failed' : 'pending',
      result: JSON.stringify({ error: err.message }),
    });
    await updateCampaign(campaignId, {
      status: failed ? 'failed' : 'approved_scheduled',
      error_message: failed ? `Failed after 3 attempts: ${err.message}` : null,
    });
  }
}
