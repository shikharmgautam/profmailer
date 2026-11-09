import { geminiGenerate } from '@/lib/research';

export async function POST(request) {
  const body = await request.json();
  const { instruction, referenceTime } = body;

  if (!instruction?.trim()) {
    return Response.json({ error: 'instruction is required' }, { status: 400 });
  }

  const now = referenceTime ? new Date(referenceTime) : new Date();
  const nowIso = now.toISOString();
  const nowLocal = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const prompt = `You are a scheduling assistant. The current date and time is: ${nowLocal} (ISO: ${nowIso}).

The user said: "${instruction}"

Parse this into an explicit scheduled send time. If they mention a day name (e.g. "Tuesday"), use the next occurrence of that day.

Rules:
- Business hours are 9 AM - 5 PM in the relevant timezone
- If timezone is unclear, default to Asia/Kolkata (IST)
- If the instruction is ambiguous, set ambiguous: true and ask a clarification question
- Do NOT invent a time if not specified — ask for clarification instead

Return JSON only:
{
  "ambiguous": false,
  "clarification_needed": null,
  "scheduled_for_iso": "2024-01-15T10:00:00.000Z",
  "scheduled_for_local": "Tuesday, January 15 at 10:00 AM IST",
  "timezone": "Asia/Kolkata",
  "explanation": "Scheduling for next Tuesday at 10 AM IST as requested."
}`;

  try {
    const text = await geminiGenerate(prompt);
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return Response.json(parsed);
    }
    return Response.json({ error: 'Could not parse schedule instruction', raw: text }, { status: 422 });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
