import { createHash, randomBytes } from 'node:crypto';
import type { PrismaClient, Prisma } from '@prisma/client';

type Connection = PrismaClient | Prisma.TransactionClient;
export const hashSessionToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function createSession(
  database: Connection,
  userId: string,
  ttlHours: number,
  previousToken?: string,
) {
  if (previousToken)
    await database.session.deleteMany({ where: { tokenHash: hashSessionToken(previousToken) } });
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
  await database.session.create({
    data: { tokenHash: hashSessionToken(token), userId, expiresAt },
  });
  return { token, expiresAt };
}

export async function findSession(database: PrismaClient, token: string) {
  const session = await database.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt <= new Date()) {
    await database.session.deleteMany({ where: { tokenHash: session.tokenHash } });
    return null;
  }
  return session;
}

export async function revokeSession(database: Connection, token: string) {
  await database.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
}
