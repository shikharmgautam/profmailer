import { v4 as uuidv4 } from 'uuid';
import { createCampaign, updateCampaign, getUserProfile } from '@/lib/db';
import { getUserIdFromRequest } from '@/lib/user-auth';
import {
  identifyProfessor,
  findPublications,
  findCurrentResearch,
  personalizeEmail,
  verifyEmailClaims,
  findProfessorEmail,
  emailMatchesName,
} from '@/lib/research';
import { startScheduler } from '@/lib/scheduler';

// Ensure scheduler is running
startScheduler();

export async function POST(request) {
  const body = await request.json();
  const { professorName, university, additionalInstructions } = body;
  const userId = getUserIdFromRequest(request);

  if (!professorName?.trim() || !university?.trim()) {
    return Response.json({ error: 'Professor name and university are required.' }, { status: 400 });
  }

  const campaignId = uuidv4();

  // Create campaign record immediately with user association
  await createCampaign({
    id: campaignId,
    user_id: userId,
    professor_name: professorName.trim(),
    university: university.trim(),
    additional_instructions: additionalInstructions || null,
  });

  // Run research pipeline asynchronously (don't await)
  runResearchPipeline(campaignId, professorName.trim(), university.trim(), additionalInstructions, userId).catch(err => {
    console.error('Research pipeline error:', err);
    updateCampaign(campaignId, {
      status: 'failed',
      error_message: err.message || 'Unknown error during research',
      progress_message: 'Research failed: ' + (err.message || 'Unknown error'),
    });
  });

  return Response.json({ campaignId }, { status: 201 });
}

async function runResearchPipeline(campaignId, professorName, university, additionalInstructions, userId = '1') {
  const profile = await getUserProfile(userId);

  // Stage 1: Identify professor
  await updateCampaign(campaignId, {
    progress_stage: 1,
    progress_message: 'Searching for professor\'s official profile...',
  });

  const identResult = await identifyProfessor(professorName, university);
  const profParsed = identResult.parsed;

  if (!profParsed?.identified || profParsed.confidence === 'low') {
    const issue = profParsed?.ambiguity_issue || 'Could not confidently identify this professor.';
    await updateCampaign(campaignId, {
      status: 'needs_clarification',
      professor_profile: identResult.parsed,
      error_message: issue,
      progress_message: 'Identity unclear: ' + issue,
    });
    return;
  }

  const prof = profParsed.professor;
  await updateCampaign(campaignId, {
    professor_profile: { ...prof, sources: identResult.sources },
    progress_stage: 2,
    progress_message: `Found: ${prof.full_name}, ${prof.department || ''} — researching publications...`,
  });

  // Stage 2: Find publications
  await updateCampaign(campaignId, {
    progress_stage: 2,
    progress_message: 'Discovering publications and research contributions...',
  });

  const pubResult = await findPublications(
    prof.full_name,
    prof.university,
    prof.department,
    prof.research_areas
  );
  const publications = pubResult.parsed?.publications || [];

  // Stage 3: Find current research
  await updateCampaign(campaignId, {
    progress_stage: 3,
    progress_message: 'Analyzing current research projects and lab activity...',
  });

  const currentResult = await findCurrentResearch(
    prof.full_name,
    prof.university,
    prof.lab_url,
    prof.profile_url
  );
  const currentResearch = currentResult.parsed;

  // Stage 4: Find email if not already known
  await updateCampaign(campaignId, {
    progress_stage: 4,
    progress_message: 'Looking for professor\'s email address...',
  });

  let recipientEmail = prof.email || null;
  let recipientEmailSource = prof.email_source || null;

  if (!recipientEmail || !recipientEmailSource) {
    const emailResult = await findProfessorEmail(prof.full_name, prof.university, prof.profile_url);
    if (emailResult.parsed?.email && (emailResult.parsed?.confidence === 'verified' || emailResult.parsed?.confidence === 'high')) {
      recipientEmail = emailResult.parsed.email;
      recipientEmailSource = emailResult.parsed.source_url || recipientEmailSource;
    }
  }

  // Strict validation: Reject any email that fails name verification
  if (recipientEmail && !emailMatchesName(recipientEmail, prof.full_name)) {
    console.warn(`Rejecting mismatched email ${recipientEmail} for professor ${prof.full_name}`);
    recipientEmail = null;
    recipientEmailSource = null;
  }

  const researchData = {
    publications,
    pub_sources: pubResult.sources,
    current_research: currentResearch,
    current_sources: currentResult.sources,
    scholar_profile: pubResult.parsed?.scholar_profile_url,
  };

  await updateCampaign(campaignId, {
    research_data: researchData,
    recipient_email: recipientEmail,
    recipient_email_source: recipientEmailSource,
  });

  // Stage 5: Personalize email
  await updateCampaign(campaignId, {
    progress_stage: 5,
    progress_message: 'Personalizing email template with verified research...',
  });

  const template = profile?.default_template || '';
  const emailResult = await personalizeEmail({
    template,
    professorProfile: prof,
    publications,
    currentResearch,
    userProfile: profile,
    additionalInstructions,
  });

  const emailParsed = emailResult.parsed;
  if (!emailParsed?.body || !emailParsed?.subject) {
    await updateCampaign(campaignId, {
      status: 'failed',
      error_message: 'Failed to generate personalized email',
      progress_message: 'Could not generate email from template',
    });
    return;
  }

  // Stage 6: Verify claims
  await updateCampaign(campaignId, {
    progress_stage: 6,
    progress_message: 'Verifying all factual claims in the email...',
    personalized_subject: emailParsed.subject,
    personalized_body: emailParsed.body,
  });

  const verifyResult = await verifyEmailClaims(emailParsed.body, publications, prof);
  const verification = verifyResult.parsed;

  // Stage 7: Ready
  await updateCampaign(campaignId, {
    progress_stage: 7,
    progress_message: 'Email ready for review and approval.',
    verification_results: verification,
    status: 'awaiting_approval',
  });
}
