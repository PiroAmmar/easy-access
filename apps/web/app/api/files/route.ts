// apps/web/app/api/files/route.ts
// File operations API — proxies requests through WebSocket to the agent.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectionManager } from '@/lib/connection-manager';
import { getServerById } from '@/db/queries';
import { logActivity } from '@/db/queries';
import type { ApiResponse } from '@easy-access/shared';
import type { FileEntry, AgentFileListPayload, AgentFileContentPayload, AgentFileOpResultPayload } from '@easy-access/shared';

interface FileListResponse extends ApiResponse<FileEntry[]> {}
interface FileContentResponse extends ApiResponse<{ content: string; mimeType: string; size: number }> {}
interface FileOpResponse extends ApiResponse<{ success: boolean }> {}

// GET /api/files?serverId=xxx&path=xxx — list directory
export async function GET(req: NextRequest): Promise<NextResponse<FileListResponse | FileContentResponse>> {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const serverId = searchParams.get('serverId');
  const path = searchParams.get('path');
  const action = searchParams.get('action'); // 'list' or 'read'

  if (!serverId || !path) {
    return NextResponse.json(
      { success: false, error: 'serverId and path are required' },
      { status: 400 }
    );
  }

  const server = await getServerById(serverId);
  if (!server) {
    return NextResponse.json(
      { success: false, error: 'Server not found' },
      { status: 404 }
    );
  }

  if (!connectionManager.isOnline(serverId)) {
    return NextResponse.json(
      { success: false, error: 'Server is offline' },
      { status: 503 }
    );
  }

  try {
    if (action === 'read') {
      // Read file content
      const result = await connectionManager.request<
        { path: string },
        AgentFileContentPayload
      >(serverId, 'hub:read-file', { path }, 30_000);

      await logActivity({
        type: 'file_read',
        path,
        serverId,
        details: { size: result.size },
      });

      return NextResponse.json({
        success: true,
        data: {
          content: result.content,
          mimeType: result.mimeType,
          size: result.size,
        },
      });
    } else {
      // List directory (default action)
      const result = await connectionManager.request<
        { path: string },
        AgentFileListPayload
      >(serverId, 'hub:list-dir', { path }, 30_000);

      return NextResponse.json({ success: true, data: result.entries });
    }
  } catch (err) {
    console.error('[API] File operation error:', err);
    const message = err instanceof Error ? err.message : 'File operation failed';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// POST /api/files — write file or create directory
export async function POST(req: NextRequest): Promise<NextResponse<FileOpResponse>> {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json() as {
      serverId?: unknown;
      path?: unknown;
      action?: unknown;
      content?: unknown; // base64 for write-file
      overwrite?: unknown; // for write-file
    };

    const serverId = body.serverId;
    const path = body.path;
    const action = body.action; // 'write' or 'mkdir'

    if (!serverId || !path || !action) {
      return NextResponse.json(
        { success: false, error: 'serverId, path, and action are required' },
        { status: 400 }
      );
    }

    const server = await getServerById(serverId as string);
    if (!server) {
      return NextResponse.json(
        { success: false, error: 'Server not found' },
        { status: 404 }
      );
    }

    if (!connectionManager.isOnline(serverId as string)) {
      return NextResponse.json(
        { success: false, error: 'Server is offline' },
        { status: 503 }
      );
    }

    let result: AgentFileOpResultPayload;

    if (action === 'write') {
      const content = body.content;
      const overwrite = body.overwrite === true;

      if (typeof content !== 'string') {
        return NextResponse.json(
          { success: false, error: 'content (base64) is required for write' },
          { status: 400 }
        );
      }

      result = await connectionManager.request<
        { path: string; content: string; overwrite: boolean },
        AgentFileOpResultPayload
      >(serverId as string, 'hub:write-file', {
        path: path as string,
        content,
        overwrite,
      }, 60_000); // Longer timeout for uploads

      await logActivity({
        type: 'file_write',
        path: path as string,
        serverId: serverId as string,
        details: { overwrite, size: content.length },
      });
    } else if (action === 'mkdir') {
      result = await connectionManager.request<
        { path: string },
        AgentFileOpResultPayload
      >(serverId as string, 'hub:mkdir', { path: path as string }, 10_000);

      await logActivity({
        type: 'mkdir',
        path: path as string,
        serverId: serverId as string,
      });
    } else {
      return NextResponse.json(
        { success: false, error: "action must be 'write' or 'mkdir'" },
        { status: 400 }
      );
    }

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error ?? 'Operation failed' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: { success: true } }, { status: 201 });
  } catch (err) {
    console.error('[API] File write error:', err);
    const message = err instanceof Error ? err.message : 'File operation failed';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// DELETE /api/files?serverId=xxx&path=xxx — delete file or empty directory
export async function DELETE(req: NextRequest): Promise<NextResponse<FileOpResponse>> {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const serverId = searchParams.get('serverId');
  const path = searchParams.get('path');

  if (!serverId || !path) {
    return NextResponse.json(
      { success: false, error: 'serverId and path are required' },
      { status: 400 }
    );
  }

  const server = await getServerById(serverId);
  if (!server) {
    return NextResponse.json(
      { success: false, error: 'Server not found' },
      { status: 404 }
    );
  }

  if (!connectionManager.isOnline(serverId)) {
    return NextResponse.json(
      { success: false, error: 'Server is offline' },
      { status: 503 }
    );
  }

  try {
    const result = await connectionManager.request<
      { path: string },
      AgentFileOpResultPayload
    >(serverId, 'hub:delete-file', { path }, 10_000);

    await logActivity({
      type: 'file_delete',
      path,
      serverId,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error ?? 'Delete failed' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: { success: true } });
  } catch (err) {
    console.error('[API] File delete error:', err);
    const message = err instanceof Error ? err.message : 'Delete failed';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// PATCH /api/files — move/rename file
export async function PATCH(req: NextRequest): Promise<NextResponse<FileOpResponse>> {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json() as {
      serverId?: unknown;
      sourcePath?: unknown;
      destinationPath?: unknown;
    };

    const serverId = body.serverId;
    const sourcePath = body.sourcePath;
    const destinationPath = body.destinationPath;

    if (!serverId || !sourcePath || !destinationPath) {
      return NextResponse.json(
        { success: false, error: 'serverId, sourcePath, and destinationPath are required' },
        { status: 400 }
      );
    }

    const server = await getServerById(serverId as string);
    if (!server) {
      return NextResponse.json(
        { success: false, error: 'Server not found' },
        { status: 404 }
      );
    }

    if (!connectionManager.isOnline(serverId as string)) {
      return NextResponse.json(
        { success: false, error: 'Server is offline' },
        { status: 503 }
      );
    }

    const result = await connectionManager.request<
      { sourcePath: string; destinationPath: string },
      AgentFileOpResultPayload
    >(serverId as string, 'hub:move-file', {
      sourcePath: sourcePath as string,
      destinationPath: destinationPath as string,
    }, 10_000);

    await logActivity({
      type: 'file_move',
      path: sourcePath as string,
      serverId: serverId as string,
      details: { destination: destinationPath },
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error ?? 'Move failed' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: { success: true } });
  } catch (err) {
    console.error('[API] File move error:', err);
    const message = err instanceof Error ? err.message : 'Move failed';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}