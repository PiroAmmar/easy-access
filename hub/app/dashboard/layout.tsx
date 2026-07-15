import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import DashboardShell from '@/components/ui/dashboard-shell';
import '@/styles/dashboard.css';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect('/login');

  return (
    <DashboardShell userName={session.user?.name} role={session.user?.role}>
      {children}
    </DashboardShell>
  );
}
