// hub/types/next-auth.d.ts
// Augments next-auth's Session/JWT types so `session.user.role` and
// `session.user.id` are recognized by TypeScript across the app.

import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: 'admin' | 'user';
    } & DefaultSession['user'];
  }

  interface User {
    role?: 'admin' | 'user';
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    role?: 'admin' | 'user';
  }
}
