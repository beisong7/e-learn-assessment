import type { Request, RequestHandler, CookieOptions } from 'express';
import type { PrismaClient, UserRole } from '@prisma/client';
import { findSession } from '../repositories/sessions.js';
import { publicUser } from '../services/auth.js';
import { HttpError } from './http-error.js';

declare global {
  namespace Express {
    interface Locals {
      user?: ReturnType<typeof publicUser>;
    }
  }
}

export const sessionCookieName = 'learnova_session';
export function readSessionToken(request: Request) {
  const value = request.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${sessionCookieName}=`))
    ?.slice(sessionCookieName.length + 1);
  return value && /^[0-9a-f]{64}$/.test(value) ? value : undefined;
}
export const cookieOptions = (production: boolean): CookieOptions => ({
  httpOnly: true,
  secure: production,
  sameSite: 'lax',
  path: '/',
});

export function requireSession(database: PrismaClient): RequestHandler {
  return async (request, response, next) => {
    const token = readSessionToken(request);
    const session = token ? await findSession(database, token) : null;
    if (!session || !session.user.isActive)
      throw new HttpError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
    response.locals.user = publicUser(session.user);
    next();
  };
}
export function requireRole(role: UserRole): RequestHandler {
  return (_request, response, next) => {
    const user = response.locals.user;
    if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
    if (user.role !== role.toLowerCase())
      throw new HttpError(403, 'FORBIDDEN', 'You do not have access to this workspace.');
    next();
  };
}

export function requireTrustedOrigin(origin: string): RequestHandler {
  return (request, _response, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && request.get('origin') !== origin) {
      throw new HttpError(
        403,
        'UNTRUSTED_ORIGIN',
        'This request did not originate from the application.',
      );
    }
    next();
  };
}
