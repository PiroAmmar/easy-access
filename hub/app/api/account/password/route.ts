import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { auth } from '@/lib/auth';
import { getAdminById, updateAccountPassword } from '@/db/queries';
import type { ApiResponse } from '@easy-access/shared';

// PATCH /api/account/password — change your own password (any authenticated account)
export async function PATCH(req: NextRequest): Promise<NextResponse<ApiResponse<null>>> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await req.json()) as { currentPassword?: unknown; newPassword?: unknown };
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

    if (newPassword.length < 8) {
      return NextResponse.json(
        { success: false, error: 'New password must be at least 8 characters' },
        { status: 400 }
      );
    }

    const account = await getAdminById(session.user.id);
    if (!account) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
    }

    const valid = await bcrypt.compare(currentPassword, account.passwordHash);
    if (!valid) {
      // Artificial delay to slow brute-force attempts, matches login behavior
      await new Promise((r) => setTimeout(r, 500));
      return NextResponse.json(
        { success: false, error: 'Current password is incorrect' },
        { status: 400 }
      );
    }

    // Prevent a no-op password change (new == current)
    const sameAsOld = await bcrypt.compare(newPassword, account.passwordHash);
    if (sameAsOld) {
      return NextResponse.json(
        { success: false, error: 'New password must be different from your current password' },
        { status: 400 }
      );
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await updateAccountPassword(account.id, newHash);

    return NextResponse.json({ success: true, data: null });
  } catch (err) {
    console.error('[API] PATCH /api/account/password error:', err);
    return NextResponse.json({ success: false, error: 'Failed to update password' }, { status: 500 });
  }
}
