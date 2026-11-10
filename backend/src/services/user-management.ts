import { Prisma, type PrismaClient } from '@prisma/client';
import { HttpError } from '../middleware/http-error.js';
import { hashPassword } from '../auth/password.js';
import { learnerDashboard } from './learning.js';

const safeUser = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const;
export async function listUsers(
  database: PrismaClient,
  query: { q: string; page: number; pageSize: number },
  learnersOnly = false,
) {
  const where: Prisma.UserWhereInput = {
    ...(learnersOnly ? { role: 'LEARNER' } : {}),
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: 'insensitive' } },
            { email: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [items, total] = await database.$transaction([
    database.user.findMany({
      where,
      select: { ...safeUser, _count: { select: { enrollments: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    database.user.count({ where }),
  ]);
  return {
    items: items.map(({ _count, ...user }) => ({ ...user, enrollmentCount: _count.enrollments })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function setLearnerStatus(
  database: PrismaClient,
  learnerId: string,
  enabled: boolean,
) {
  return database.$transaction(async (transaction) => {
    const rows = await transaction.$queryRaw<
      { id: string }[]
    >`SELECT id FROM users WHERE id = ${learnerId}::uuid AND role = 'LEARNER' FOR UPDATE`;
    if (!rows[0]) throw new HttpError(404, 'LEARNER_NOT_FOUND', 'This learner does not exist.');
    const user = await transaction.user.update({
      where: { id: learnerId },
      data: { isActive: enabled },
      select: safeUser,
    });
    if (!enabled) await transaction.session.deleteMany({ where: { userId: learnerId } });
    return user;
  });
}

export async function learnerCourses(database: PrismaClient, id: string) {
  const learner = await database.user.findFirst({
    where: { id, role: 'LEARNER' },
    select: safeUser,
  });
  if (!learner) throw new HttpError(404, 'LEARNER_NOT_FOUND', 'This learner does not exist.');
  const dashboard = await learnerDashboard(database, id);
  return {
    learner,
    courses: dashboard.enrollments.map((item) => ({
      id: item.courseId,
      title: item.course.title,
      enrolledAt: item.enrolledAt,
      ...item.learning,
    })),
  };
}

export async function createAdministrator(
  database: PrismaClient,
  input: { name: string; email: string; password: string },
) {
  const passwordHash = await hashPassword(input.password);
  try {
    return await database.user.create({
      data: { name: input.name, email: input.email, passwordHash, role: 'ADMIN' },
      select: safeUser,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      throw new HttpError(409, 'EMAIL_IN_USE', 'An account with this email already exists.');
    throw error;
  }
}
