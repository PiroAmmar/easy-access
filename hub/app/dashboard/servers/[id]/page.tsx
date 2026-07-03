import { getServerById } from '@/db/queries';
import type { Metadata } from 'next';
import ServerDetailClient from './server-detail-client';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const session = await auth();
  const server = await getServerById(id, session?.user?.id);
  return { title: server?.name ?? 'Server' };
}

export default async function ServerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ServerDetailClient serverId={id} />;
}
