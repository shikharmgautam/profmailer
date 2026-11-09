import { getUserByEmail } from '@/lib/db';
import { verifyPassword, createSession, attachSessionCookie } from '@/lib/auth';

export async function POST(request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !email.trim()) {
      return Response.json({ error: 'Email address is required.' }, { status: 400 });
    }

    if (!password) {
      return Response.json({ error: 'Password is required.' }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await getUserByEmail(cleanEmail);

    if (!user) {
      return Response.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    const isValid = verifyPassword(password, user.password_hash);
    if (!isValid) {
      return Response.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    // Start authenticated session
    const session = await createSession(user.id);

    const sanitizedUser = { ...user };
    delete sanitizedUser.password_hash;

    const res = Response.json({
      success: true,
      user: sanitizedUser,
      message: 'Signed in successfully.'
    });

    attachSessionCookie(res, session.token);
    return res;
  } catch (err) {
    console.error('Login error:', err);
    return Response.json({ error: err.message || 'Login failed.' }, { status: 500 });
  }
}

