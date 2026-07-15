import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getServerById, deleteServer, execute } from '@/db/queries';
import { connectionManager } from '@/lib/connection-manager';
import type { ApiResponse, Server } from '@easy-access/shared';

// GET /api/servers/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<Server & { isConnected: boolean }>>> {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const adminId = session.user?.id;
  const { id } = await params;
  const server = await getServerById(id, adminId);
  if (!server) {
    return NextResponse.json({ success: false, error: 'Server not found' }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    data: { ...server, isOnline: connectionManager.isOnline(id), isConnected: connectionManager.isOnline(id) },
  });
}

// PUT /api/servers/[id] — update server name, description, allowedDirs
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<Server>>> {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const adminId = session.user?.id;
  const { id } = await params;
  const server = await getServerById(id, adminId);
  if (!server) {
    return NextResponse.json({ success: false, error: 'Server not found' }, { status: 404 });
  }

  try {
    const body = await req.json() as {
      name?: unknown;
      description?: unknown;
      allowedDirs?: unknown;
    };

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (typeof body.name === 'string' && body.name.trim()) {
      updates.push(`name = $${paramIdx++}`);
      values.push(body.name.trim());
    }
    if (typeof body.description === 'string') {
      updates.push(`description = $${paramIdx++}`);
      values.push(body.description.trim() || null);
    }
    if (Array.isArray(body.allowedDirs)) {
      updates.push(`allowed_dirs = $${paramIdx++}::jsonb`);
      values.push(JSON.stringify(body.allowedDirs));
    }

    if (updates.length === 0) {
      return NextResponse.json({ success: false, error: 'No fields to update' }, { status: 400 });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    await execute(
      `UPDATE servers SET ${updates.join(', ')} WHERE id = $${paramIdx} AND admin_id = $${paramIdx + 1}`,
      [...values, adminId]
    );

    const updated = await getServerById(id, adminId);

    if (Array.isArray(body.allowedDirs) && updated) {
      connectionManager.push(id, 'hub:allowed-dirs-update', {
        allowedDirs: updated.allowedDirs,
      });
    }

    return NextResponse.json({ success: true, data: updated! });
  } catch (err) {
    console.error('[API] PUT /api/servers/[id] error:', err);
    return NextResponse.json({ success: false, error: 'Update failed' }, { status: 500 });
  }
}

// DELETE /api/servers/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse>> {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const adminId = session.user?.id;
  const { id } = await params;

  // Verify ownership before deleting
  const server = await getServerById(id, adminId);
  if (!server) {
    return NextResponse.json({ success: false, error: 'Server not found' }, { status: 404 });
  }

  const deleted = await deleteServer(id);
  if (!deleted) {
    return NextResponse.json({ success: false, error: 'Server not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
