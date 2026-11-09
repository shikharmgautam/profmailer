import { listUserProfiles, createUserProfile } from '@/lib/db';

export async function GET() {
  try {
    const users = await listUserProfiles();
    return Response.json(users.map(u => {
      const copy = { ...u };
      delete copy.password_hash;
      return copy;
    }));
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
    const sanitized = { ...created };
    delete sanitized.password_hash;
    return Response.json(sanitized, { status: 201 });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
