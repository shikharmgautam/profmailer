import { getUserProfile, updateUserProfile } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';

export async function GET(request) {
  const user = await authenticateRequest(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
  }

  const profile = await getUserProfile(user.id);
  if (profile) {
    delete profile.password_hash;
  }
  return Response.json(profile || {});
}

export async function POST(request) {
  const user = await authenticateRequest(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized. Please sign in to update your profile.' }, { status: 401 });
  }

  const body = await request.json();
  // Authorization check: User can ONLY update their own profile (user.id)
  await updateUserProfile(body, user.id);
  const updated = await getUserProfile(user.id);
  if (updated) {
    delete updated.password_hash;
  }
  return Response.json(updated);
}
