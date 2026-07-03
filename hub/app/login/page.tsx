import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import LoginForm from './login-form';

export const metadata: Metadata = {
  title: 'Sign In',
  description: 'Sign in to Easy Access',
};

export default async function LoginPage() {
  const session = await auth();

  if (session) {
    redirect('/dashboard');
  }

  return (
    <main className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <div className="auth-logo">
            {/* Logo mark — hexagon with center dot */}
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
              <path
                d="M14 3L24 8.5V19.5L14 25L4 19.5V8.5L14 3Z"
                stroke="#818cf8"
                strokeWidth="1.5"
                fill="none"
                strokeLinejoin="round"
              />
              <circle cx="14" cy="14" r="3" fill="#818cf8" />
            </svg>
          </div>
          <div>
            <h1 className="auth-title">Easy Access</h1>
            <p className="auth-subtitle">Sign in to your control panel</p>
          </div>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
