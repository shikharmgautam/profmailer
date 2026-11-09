import { listUserProfiles, createUserProfile, getUserProfile } from '@/lib/db';

export async function GET() {
  try {
    const users = await listUserProfiles();
    return Response.json(users);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (!body.name || !body.name.trim()) {
      return Response.json({ error: 'Name is required to create a profile.' }, { status: 400 });
    }
    const created = await createUserProfile(body);
    return Response.json(created, { status: 201 });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

