import { Prisma, type PrismaClient, type User } from '@prisma/client';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { HttpError } from '../middleware/http-error.js';
import { createSession } from '../repositories/sessions.js';

export function publicUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role === 'ADMIN' ? ('admin' as const) : ('learner' as const),
  };
}

// The same KDF work is performed for unknown users to reduce account-enumeration timing differences.
const dummyHash = `scrypt$131072$8$1$${'0'.repeat(32)}$${'0'.repeat(128)}`;

export async function login(
  database: PrismaClient,
  input: { email: string; password: string },
  ttlHours: number,
  previousToken?: string,
) {
  const user = await database.user.findUnique({ where: { email: input.email } });
  const matches = await verifyPassword(input.password, user?.passwordHash ?? dummyHash);
  if (!user || !matches)
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  const session = await database.$transaction(async (transaction) => {
    // Serialize session creation with learner disable/re-enable operations.
    const rows = await transaction.$queryRaw<
      { is_active: boolean }[]
    >`SELECT is_active FROM users WHERE id = ${user.id}::uuid FOR UPDATE`;
    if (!rows[0]?.is_active)
      throw new HttpError(
        403,
        'ACCOUNT_DISABLED',
        'Your account is disabled. Please contact an administrator.',
      );
    return createSession(transaction, user.id, ttlHours, previousToken);
  });
  return { user: publicUser(user), ...session };
}

export async function register(
  database: PrismaClient,
  input: { name: string; email: string; password: string },
  ttlHours: number,
  previousToken?: string,
) {
  const passwordHash = await hashPassword(input.password);
  try {
    return await database.$transaction(async (transaction) => {
      const user = await transaction.user.create({
        data: { name: input.name, email: input.email, passwordHash, role: 'LEARNER' },
      });
      const session = await createSession(transaction, user.id, ttlHours, previousToken);
      return { user: publicUser(user), ...session };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new HttpError(409, 'EMAIL_IN_USE', 'An account with this email already exists.');
    }
    throw error;
  }
}
