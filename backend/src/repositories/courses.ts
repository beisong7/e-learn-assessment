import { Prisma, type PrismaClient } from '@prisma/client';
import { HttpError } from '../middleware/http-error.js';

export const lessonMetadata = {
  id: true,
  courseId: true,
  title: true,
  durationSeconds: true,
  order: true,
} as const;
export const summarySelect = {
  id: true,
  title: true,
  description: true,
  category: true,
  thumbnailUrl: true,
  instructorName: true,
  level: true,
  outcomes: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  lessons: { select: { durationSeconds: true }, orderBy: { order: 'asc' as const } },
} satisfies Prisma.CourseSelect;
export const publicDetailSelect = {
  ...summarySelect,
  lessons: { select: lessonMetadata, orderBy: { order: 'asc' as const } },
} satisfies Prisma.CourseSelect;
export const adminInclude = {
  lessons: { orderBy: { order: 'asc' as const } },
} satisfies Prisma.CourseInclude;

export function summarize<T extends { lessons: { durationSeconds: number }[] }>(course: T) {
  const { lessons, ...fields } = course;
  return {
    ...fields,
    lessonCount: lessons.length,
    durationSeconds: lessons.reduce((sum, lesson) => sum + lesson.durationSeconds, 0),
  };
}
export async function lockCourse(
  transaction: Prisma.TransactionClient,
  id: string,
  expectedVersion: number,
) {
  const rows = await transaction.$queryRaw<
    { id: string; version: number }[]
  >`SELECT id, version FROM courses WHERE id = ${id}::uuid FOR UPDATE`;
  if (!rows[0]) throw new HttpError(404, 'COURSE_NOT_FOUND', 'This course no longer exists.');
  if (rows[0].version !== expectedVersion)
    throw new HttpError(
      409,
      'CONTENT_CONFLICT',
      'This course changed since you opened it. Reload the latest version before saving.',
    );
}
export async function publicCourse(database: PrismaClient, id: string) {
  const course = await database.course.findUnique({ where: { id }, select: publicDetailSelect });
  if (!course) throw new HttpError(404, 'COURSE_NOT_FOUND', 'This course no longer exists.');
  return { ...summarize(course), lessons: course.lessons };
}
