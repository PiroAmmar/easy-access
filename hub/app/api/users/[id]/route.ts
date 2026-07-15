import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getAdminById, getAllAccounts, deleteAccount } from '@/db/queries';
import type { ApiResponse } from '@easy-access/shared';

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
