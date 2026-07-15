// apps/web/lib/auth.ts
// NextAuth.js v5 configuration — single admin, Credentials provider.
// Reads the admin record from the PostgreSQL `admins` table.
// Password is bcrypt-hashed in the database.

import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { getAdminByUsername } from '@/db/queries';
import { authConfig } from './auth.config';

// bcryptjs is a pure-JS bcrypt that works in Edge Runtime.
// Install: pnpm add bcryptjs && pnpm add -D @types/bcryptjs
import bcrypt from 'bcryptjs';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials: Record<string, any> | undefined) {
        const username = credentials?.username;
        const password = credentials?.password;

        if (typeof username !== 'string' || typeof password !== 'string') {
          return null;
        }

        const admin = await getAdminByUsername(username.trim().toLowerCase());
        if (!admin) {
          // Artificial delay to slow brute-force attempts
          await new Promise((r) => setTimeout(r, 500));
          return null;
        }

        const valid = await bcrypt.compare(password, admin.passwordHash);
        if (!valid) {
          await new Promise((r) => setTimeout(r, 500));
          return null;
        }

        // Return the shape NextAuth expects for the user object
        return {
          id: admin.id,
          name: admin.username,
          email: null,
          role: admin.role,
        };
      },
    }),
  ],
});
