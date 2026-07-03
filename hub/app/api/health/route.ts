// hub/app/api/health/route.ts
// Unauthenticated health check for Railway (and uptime monitors).
// Must stay excluded from the auth middleware — see middleware.ts.

import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await pool.query('SELECT 1');
    return NextResponse.json({ status: 'ok', db: 'up' });
  } catch {
    return NextResponse.json({ status: 'degraded', db: 'down' }, { status: 503 });
  }
}
