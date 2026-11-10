import type { PrismaClient } from '@prisma/client';
import { hashPassword } from '../auth/password.js';

export const demoAccounts = [
  { name: 'Demo Learner', email: 'learner@app.com', role: 'LEARNER' as const },
  { name: 'Demo Administrator', email: 'admin@app.com', role: 'ADMIN' as const },
];

export async function seedAccounts(database: PrismaClient, password: string) {
  // Reruns preserve existing identities and password hashes; this is not a password-reset command.
  const records: Array<(typeof demoAccounts)[number] & { passwordHash: string }> = [];
  for (const account of demoAccounts) {
    const existing = await database.user.findUnique({ where: { email: account.email } });
    if (existing && existing.role !== account.role) {
      throw new Error('An existing demo account has a different role; resolve it before seeding.');
    }
    records.push({
      ...account,
      passwordHash: existing?.passwordHash ?? (await hashPassword(password)),
    });
  }
  return database.$transaction(async (transaction) => {
    const users = [];
    for (const record of records) {
      const user = await transaction.user.upsert({
        where: { email: record.email },
        create: record,
        update: {},
        select: { id: true, email: true, role: true },
      });
      if (user.role !== record.role) throw new Error('Demo account role conflict.');
      users.push(user);
    }
    return users;
  });
}
