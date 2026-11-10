import { z } from 'zod';

export const databaseUrlSchema = z.string().refine((value) => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return (
    ['postgresql:', 'postgres:'].includes(url.protocol) && !!url.hostname && url.pathname.length > 1
  );
}, 'Must be a PostgreSQL URL including a host and database name');

const environmentSchema = z.object({
  DATABASE_URL: databaseUrlSchema,
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(24),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  FRONTEND_ORIGIN: z
    .string()
    .url()
    .refine((value) => {
      if (!URL.canParse(value)) return false;
      const url = new URL(value);
      return (
        ['http:', 'https:'].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        url.pathname === '/' &&
        !url.search &&
        !url.hash
      );
    }, 'Must be an HTTP(S) origin without credentials, a path, query, or fragment')
    .transform((value) => new URL(value).origin)
    .default('http://localhost:5173'),
});

export type Environment = z.infer<typeof environmentSchema>;

export function parseEnvironment(values: Record<string, string | undefined>): Environment {
  const result = environmentSchema.safeParse(values);
  if (!result.success) {
    // Report field names and validation messages, never environment values or secrets.
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return result.data;
}
