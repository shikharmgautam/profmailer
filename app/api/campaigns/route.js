import { v4 as uuidv4 } from 'uuid';
import { createCampaign, updateCampaign, getUserProfile } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';
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
  const user = await authenticateRequest(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized. Please sign in to launch campaigns.' }, { status: 401 });
  }

  const body = await request.json();
  const { professorName, university, additionalInstructions } = body;
  const userId = String(user.id);

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
  let verification = verifyResult.parsed;
  let finalSubject = emailParsed.subject;
  let finalBody = emailParsed.body;

  // Stage 6.5: Auto-fix if any claims are incorrect — never show wrong emails to users
  const incorrectClaims = (verification?.claims || []).filter(c => c.status === 'incorrect');
  if (incorrectClaims.length > 0) {
    await updateCampaign(campaignId, {
      progress_stage: 6,
      progress_message: `Auto-correcting ${incorrectClaims.length} incorrect claim(s) before review...`,
    });

    // Build a correction brief from the verifier's own action_needed text
    const correctionBrief = incorrectClaims
      .map((c, i) => `${i + 1}. REMOVE/FIX: "${c.claim}"\n   Reason: ${c.explanation}\n   Required action: ${c.action_needed}`)
      .join('\n\n');

    const profActualResearch = [
      prof.research_interests,
      prof.research_areas?.join(', '),
      publications?.slice(0, 3).map(p => p.title).join('; '),
    ].filter(Boolean).join(' | ');

    const fixedEmailResult = await personalizeEmail({
      template: '',
      professorProfile: prof,
      publications,
      currentResearch,
      userProfile: profile,
      additionalInstructions: [
        `CRITICAL CORRECTIONS — apply every one before writing the email:`,
        correctionBrief,
        ``,
        `Professor's VERIFIED research focus (use ONLY this): ${profActualResearch}`,
        ``,
        `Original user instructions (apply after corrections): ${additionalInstructions || 'none'}`,
      ].join('\n'),
    });

    if (fixedEmailResult.parsed?.body && fixedEmailResult.parsed?.subject) {
      // Re-verify the fixed email
      const reVerifyResult = await verifyEmailClaims(fixedEmailResult.parsed.body, publications, prof);
      const reVerification = reVerifyResult.parsed;
      const stillIncorrect = (reVerification?.claims || []).filter(c => c.status === 'incorrect');

      if (stillIncorrect.length === 0) {
        // All claims now correct — use the fixed version
        finalSubject = fixedEmailResult.parsed.subject;
        finalBody = fixedEmailResult.parsed.body;
        verification = reVerification;
      } else {
        // Fixed attempt still has errors — keep fix but flag it in verification
        finalSubject = fixedEmailResult.parsed.subject;
        finalBody = fixedEmailResult.parsed.body;
        verification = reVerification;
        console.warn(`[Campaign ${campaignId}] Auto-fix reduced errors from ${incorrectClaims.length} to ${stillIncorrect.length} but could not eliminate all.`);
      }
    }
    // Update the stored email body to the corrected version
    await updateCampaign(campaignId, {
      personalized_subject: finalSubject,
      personalized_body: finalBody,
    });
  }

  // Stage 7: Ready
  await updateCampaign(campaignId, {
    progress_stage: 7,
    progress_message: 'Email ready for review and approval.',
    verification_results: verification,
    status: 'awaiting_approval',
  });
}
