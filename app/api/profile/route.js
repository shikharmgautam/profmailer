import { getUserProfile, updateUserProfile } from '@/lib/db';

export async function GET() {
  const profile = await getUserProfile();
  return Response.json(profile || {});
}

export async function POST(request) {
  const body = await request.json();
  await updateUserProfile(body);
  const updated = await getUserProfile();
  return Response.json(updated);
}
