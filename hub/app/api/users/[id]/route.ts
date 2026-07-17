import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { auth } from '@/lib/auth';
import { getAdminById, getAllAccounts, deleteAccount, updateAccountPassword } from '@/db/queries';
import type { ApiResponse } from '@easy-access/shared';

const CHARS = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
function generatePassword(length = 12): string {
  return Array.from({ length }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
}

// DELETE /api/users/[id] — remove an account (admin only)
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<null>>> {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user?.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden — admin only' }, { status: 403 });
  }

  const { id } = await params;

  if (id === session.user.id) {
    return NextResponse.json(
      { success: false, error: 'You cannot delete your own account' },
      { status: 400 }
    );
  }

  try {
    const target = await getAdminById(id);
    if (!target) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    if (target.role === 'admin') {
      const all = await getAllAccounts();
      const adminCount = all.filter((a) => a.role === 'admin').length;
      if (adminCount <= 1) {
        return NextResponse.json(
          { success: false, error: 'Cannot delete the last remaining admin' },
          { status: 400 }
        );
      }
    }

    await deleteAccount(id);
    return NextResponse.json({ success: true, data: null });
  } catch (err) {
    console.error('[API] DELETE /api/users/[id] error:', err);
    return NextResponse.json({ success: false, error: 'Failed to delete user' }, { status: 500 });
  }
}

// PATCH /api/users/[id] — reset password, returns new plaintext password once (admin only)
export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<{ newPassword: string }>>> {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user?.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden — admin only' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const target = await getAdminById(id);
    if (!target) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const newPassword = generatePassword();
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await updateAccountPassword(id, passwordHash);

    return NextResponse.json({ success: true, data: { newPassword } });
  } catch (err) {
    console.error('[API] PATCH /api/users/[id] error:', err);
    return NextResponse.json({ success: false, error: 'Failed to reset password' }, { status: 500 });
  }
}
