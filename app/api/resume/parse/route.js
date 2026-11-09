import { GoogleGenAI } from '@google/genai';
import { updateUserProfile, getUserProfile } from '@/lib/db';
import { getUserIdFromRequest } from '@/lib/user-auth';

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'];

async function callGenAI(contents) {
  let lastErr = null;
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await genai.models.generateContent({
          model,
          contents,
          config: { temperature: 0.1 },
        });
        const text = res.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
        if (text) return text;
      } catch (err) {
        lastErr = err;
        if (err.message?.includes('503') || err.message?.includes('UNAVAILABLE')) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        break;
      }
    }
  }
  throw lastErr || new Error('All model attempts failed');
}

export async function POST(request) {
  try {
    const userId = getUserIdFromRequest(request);
    const body = await request.json();
    const { resumeText, fileData, mimeType } = body;

    if (!resumeText?.trim() && !fileData) {
      return Response.json({ error: 'Please provide resume text or upload a file.' }, { status: 400 });
    }

    const extractionInstruction = `You are an expert academic resume & CV parser.
Extract the candidate's authentic academic profile from the provided resume.

Respond in this exact JSON format:
{
  "name": "Full Name",
  "email": "Email address or empty string",
  "education": "Degree, Major, University, GPA / Graduation Year",
  "target_degree": "Inferred target degree, e.g. PhD, Master's, Research Assistant, or Internship",
  "research_interests": "Comma-separated list of research topics",
  "skills": "Key programming languages, frameworks, mathematical/domain tools",
  "projects": "Concise summary of 2-3 most notable research, software, or academic projects",
  "background": "A polished 2-paragraph academic background summary highlighting experience and goals, ideal for cold emails to university professors",
  "suggested_fields": ["Field 1", "Field 2", "Field 3", "Field 4"]
}`;

    const parts = [];
    if (fileData && mimeType === 'application/pdf') {
      parts.push({
        inlineData: {
          mimeType: 'application/pdf',
          data: fileData.includes(',') ? fileData.split(',')[1] : fileData,
        },
      });
    }

    parts.push({
      text: `${extractionInstruction}\n\nRESUME CONTENT:\n${resumeText || 'See attached PDF document.'}`,
    });

    const responseText = await callGenAI([{ role: 'user', parts }]);
    const match = responseText.match(/```(?:json)?\s*([\s\S]*?)```/) || responseText.match(/(\{[\s\S]*\})/);
    if (!match) {
      return Response.json({ error: 'Failed to parse resume into structured JSON', raw: responseText }, { status: 422 });
    }

    const parsed = JSON.parse(match[1]);

    // Update user profile in database
    await updateUserProfile({
      name: parsed.name || undefined,
      email: parsed.email || undefined,
      education: parsed.education || '',
      target_degree: parsed.target_degree || '',
      research_interests: parsed.research_interests || '',
      skills: parsed.skills || '',
      projects: parsed.projects || '',
      background: parsed.background || '',
      cv_text: resumeText || `${parsed.education}\nSkills: ${parsed.skills}\nProjects: ${parsed.projects}`,
    }, userId);

    const updated = await getUserProfile(userId);

    return Response.json({
      success: true,
      profile: updated,
      suggested_fields: parsed.suggested_fields || [],
    });
  } catch (err) {
    console.error('Resume parse error:', err);
    return Response.json({ error: err.message || 'Error parsing resume' }, { status: 500 });
  }
}

