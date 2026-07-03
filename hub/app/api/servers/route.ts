import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getAllServers, createServer } from '@/db/queries';
import { connectionManager } from '@/lib/connection-manager';
import crypto from 'crypto';
import type { ApiResponse, Server } from '@easy-access/shared';

function generateAgentToken(): string {
  // 32 bytes = 256 bits of entropy, URL-safe base64
  return crypto.randomBytes(32).toString('base64url');
}

// GET /api/servers — list all registered servers
export async function GET(): Promise<NextResponse<ApiResponse<Server[]>>> {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const adminId = session.user?.id;
  if (!adminId) {
    return NextResponse.json({ success: false, error: 'Session missing user ID' }, { status: 400 });
  }

  try {
    const servers = await getAllServers(adminId);
    const onlineIds = connectionManager.getOnlineServerIds();
    const mapped = servers.map(s => ({ ...s, isOnline: onlineIds.includes(s.id) }));
    return NextResponse.json({ success: true, data: mapped });
  } catch (err) {
    console.error('[API] GET /api/servers error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch servers' },
      { status: 500 }
    );
  }
}

// POST /api/servers — register a new server
export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<Server>>> {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const adminId = session.user?.id;
  if (!adminId) {
    return NextResponse.json({ success: false, error: 'Session missing user ID' }, { status: 400 });
  }

  try {
    const body = await req.json() as {
      name?: unknown;
      description?: unknown;
      allowedDirs?: unknown;
    };

    const name = body.name;
    const description = body.description;
    const allowedDirs = body.allowedDirs;

    if (typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'name is required and must be a string' },
        { status: 400 }
      );
    }

    if (!Array.isArray(allowedDirs) || allowedDirs.some((d) => typeof d !== 'string')) {
      return NextResponse.json(
        { success: false, error: 'allowedDirs must be an array of strings' },
        { status: 400 }
      );
    }

    const agentToken = generateAgentToken();

    const server = await createServer({
      name: name.trim(),
      description: typeof description === 'string' ? description.trim() : undefined,
      agentToken,
      allowedDirs: allowedDirs as string[],
      adminId,
    });

    return NextResponse.json({ success: true, data: server }, { status: 201 });
  } catch (err) {
    console.error('[API] POST /api/servers error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to create server' },
      { status: 500 }
    );
  }
}
