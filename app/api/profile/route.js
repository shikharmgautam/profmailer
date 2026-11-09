import { getUserProfile, updateUserProfile } from '@/lib/db';
import { getUserIdFromRequest } from '@/lib/user-auth';

export async function GET(request) {
  const userId = getUserIdFromRequest(request);
  const profile = await getUserProfile(userId);
  return Response.json(profile || {});
}

export async function POST(request) {
  const userId = getUserIdFromRequest(request);
  const body = await request.json();
  await updateUserProfile(body, userId);
  const updated = await getUserProfile(userId);
  return Response.json(updated);
}
