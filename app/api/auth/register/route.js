import { getUserByEmail, createUserProfile } from '@/lib/db';
import { createSession, attachSessionCookie } from '@/lib/auth';

export async function POST(request) {
  try {
    const body = await request.json();
    const { name, email, password, education, targetDegree, skills, projects, background, researchInterests } = body;

    if (!name || !name.trim()) {
      return Response.json({ error: 'Full name is required.' }, { status: 400 });
    }

    if (!email || !email.trim() || !email.includes('@')) {
      return Response.json({ error: 'Valid email address is required.' }, { status: 400 });
    }

    if (!password || password.length < 6) {
      return Response.json({ error: 'Password must be at least 6 characters long.' }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Check if email already exists
    const existing = await getUserByEmail(cleanEmail);
    if (existing) {
      return Response.json(
        { error: 'An account with this email already exists. Please sign in.' },
        { status: 409 }
      );
    }

    // Create user profile
    const createdUser = await createUserProfile({
      name: name.trim(),
      email: cleanEmail,
      password,
      education: education?.trim() || null,
      target_degree: targetDegree || 'Research Internship',
      skills: skills?.trim() || null,
      projects: projects?.trim() || null,
      background: background?.trim() || null,
      research_interests: researchInterests?.trim() || null
    });

    // Start authenticated session
    const session = await createSession(createdUser.id);

    // Build response and attach HttpOnly cookie
    const sanitizedUser = { ...createdUser };
    delete sanitizedUser.password_hash;

    const res = Response.json({
      success: true,
      user: sanitizedUser,
      message: 'Account created successfully.'
    }, { status: 201 });

    attachSessionCookie(res, session.token);
    return res;
  } catch (err) {
    console.error('Registration error:', err);
    return Response.json({ error: err.message || 'Registration failed.' }, { status: 500 });
  }
}

