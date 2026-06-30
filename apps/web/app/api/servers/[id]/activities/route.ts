import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getServerActivities } from '@/db/queries';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const activities = await getServerActivities(id, 20);
  return NextResponse.json({ success: true, data: activities });
}
