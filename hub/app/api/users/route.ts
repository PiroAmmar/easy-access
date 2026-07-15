import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { auth } from '@/lib/auth';
import { getAllAccounts, createAdmin, getAdminByUsername } from '@/db/queries';
import type { ApiResponse, Admin } from '@easy-access/shared';

type PublicAccount = Omit<Admin, 'passwordHash'>;

// GET /api/users — list all accounts (admin only)
export async function GET(): Promise<NextResponse<ApiResponse<PublicAccount[]>>> {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user?.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden — admin only' }, { status: 403 });
  }

  try {
    const accounts = await getAllAccounts();
    return NextResponse.json({ success: true, data: accounts });
  } catch (err) {
    console.error('[API] GET /api/users error:', err);
    return NextResponse.json({ success: false, error: 'Failed to fetch users' }, { status: 500 });
  }
}

// POST /api/users — create a new account (admin only)
export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<PublicAccount>>> {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user?.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden — admin only' }, { status: 403 });
  }

  try {
    const body = (await req.json()) as { username?: unknown; password?: unknown; role?: unknown };
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const role = body.role === 'admin' ? 'admin' : 'user'; // default to the least-privileged role

    if (!username) {
      return NextResponse.json({ success: false, error: 'Username is required' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    const existing = await getAdminByUsername(username);
    if (existing) {
      return NextResponse.json(
        { success: false, error: `Username "${username}" is already taken` },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const account = await createAdmin(username, passwordHash, role);
    const { passwordHash: _omit, ...publicAccount } = account;

    return NextResponse.json({ success: true, data: publicAccount }, { status: 201 });
  } catch (err) {
    console.error('[API] POST /api/users error:', err);
    return NextResponse.json({ success: false, error: 'Failed to create user' }, { status: 500 });
  }
}
