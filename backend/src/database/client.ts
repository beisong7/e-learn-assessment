import { PrismaClient } from '@prisma/client';

export function createDatabaseClient(databaseUrl: string) {
  return new PrismaClient({
    datasources: { db: { url: databaseUrl } },
    log: [],
  });
}

export type DatabaseClient = ReturnType<typeof createDatabaseClient>;
