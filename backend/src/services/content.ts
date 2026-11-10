import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { HttpError } from '../middleware/http-error.js';
import { adminInclude, lockCourse, summarize, summarySelect } from '../repositories/courses.js';
import type { CreateCourseInput, ReplaceCourseInput } from './content-validation.js';

type ListInput = {
  q: string;
  category?: 'DESIGN' | 'DEVELOPMENT' | 'DATA_SCIENCE' | 'BUSINESS';
  page: number;
  pageSize: number;
};
export async function listCourses(database: PrismaClient, input: ListInput) {
  const where: Prisma.CourseWhereInput = {
    ...(input.category ? { category: input.category } : {}),
    ...(input.q
      ? {
          OR: [
            { title: { contains: input.q, mode: 'insensitive' } },
            { description: { contains: input.q, mode: 'insensitive' } },
            { instructorName: { contains: input.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [courses, total] = await database.$transaction([
    database.course.findMany({
      where,
      select: summarySelect,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    database.course.count({ where }),
  ]);
  return { items: courses.map(summarize), total, page: input.page, pageSize: input.pageSize };
}
export async function adminCourse(database: PrismaClient, id: string) {
  const course = await database.course.findUnique({ where: { id }, include: adminInclude });
  if (!course) throw new HttpError(404, 'COURSE_NOT_FOUND', 'This course no longer exists.');
  return { ...summarize(course), lessons: course.lessons };
}
export async function createCourse(database: PrismaClient, input: CreateCourseInput) {
  const { lessons, ...fields } = input;
  // IDs supplied by an editor for new lessons may not adopt an existing lesson.
  const ids = lessons.flatMap((lesson) => (lesson.id ? [lesson.id] : []));
  if (ids.length && (await database.lesson.count({ where: { id: { in: ids } } })))
    throw new HttpError(400, 'INVALID_LESSON', 'A lesson ID already belongs to existing content.');
  const course = await database.course.create({
    data: { ...fields, lessons: { create: lessons } },
    include: adminInclude,
  });
  return { ...summarize(course), lessons: course.lessons };
}

async function parkLessons(transaction: Prisma.TransactionClient, courseId: string) {
  const max = await transaction.lesson.aggregate({ where: { courseId }, _max: { order: true } });
  const offset = (max._max.order || 0) + 501;
  await transaction.lesson.updateMany({
    where: { courseId },
    data: { order: { increment: offset } },
  });
}
async function bumpVersion(transaction: Prisma.TransactionClient, id: string) {
  const course = await transaction.course.update({
    where: { id },
    data: { version: { increment: 1 } },
    include: adminInclude,
  });
  return { ...summarize(course), lessons: course.lessons };
}
export async function replaceCourse(database: PrismaClient, id: string, input: ReplaceCourseInput) {
  return database.$transaction(async (transaction) => {
    await lockCourse(transaction, id, input.expectedVersion);
    const { expectedVersion: _version, lessons, ...fields } = input;
    const current = await transaction.lesson.findMany({
      where: { courseId: id },
      select: { id: true },
    });
    const owned = new Set(current.map((lesson) => lesson.id));
    const requestedIds = lessons.flatMap((lesson) => (lesson.id ? [lesson.id] : []));
    const foreign = await transaction.lesson.count({
      where: { id: { in: requestedIds }, courseId: { not: id } },
    });
    if (foreign)
      throw new HttpError(400, 'INVALID_LESSON', 'Lessons cannot be moved between courses.');
    await parkLessons(transaction, id);
    await transaction.lesson.deleteMany({ where: { courseId: id, id: { notIn: requestedIds } } });
    for (const lesson of lessons) {
      const { id: lessonId, ...data } = lesson;
      if (lessonId && owned.has(lessonId))
        await transaction.lesson.update({
          where: { id_courseId: { id: lessonId, courseId: id } },
          data,
        });
      else
        await transaction.lesson.create({
          data: { ...data, id: lessonId || randomUUID(), courseId: id },
        });
    }
    await transaction.course.update({ where: { id }, data: fields });
    return bumpVersion(transaction, id);
  });
}
export async function patchCourse(
  database: PrismaClient,
  id: string,
  input: Partial<CreateCourseInput> & { expectedVersion: number },
) {
  return database.$transaction(async (transaction) => {
    await lockCourse(transaction, id, input.expectedVersion);
    const { expectedVersion: _version, lessons: _lessons, ...data } = input;
    await transaction.course.update({ where: { id }, data });
    return bumpVersion(transaction, id);
  });
}
export async function deleteCourse(database: PrismaClient, id: string, version: number) {
  await database.$transaction(async (transaction) => {
    await lockCourse(transaction, id, version);
    await transaction.course.delete({ where: { id } });
  });
}

type LessonFields = { title: string; videoUrl: string; durationSeconds: number };
export async function createLesson(
  database: PrismaClient,
  courseId: string,
  input: LessonFields & { order?: number; expectedVersion: number },
) {
  return database.$transaction(async (transaction) => {
    await lockCourse(transaction, courseId, input.expectedVersion);
    const current = await transaction.lesson.findMany({
      where: { courseId },
      orderBy: { order: 'asc' },
    });
    const order = input.order || current.length + 1;
    if (current.length >= 500 || order > current.length + 1)
      throw new HttpError(400, 'INVALID_ORDER', 'Choose an order within the course learning path.');
    await parkLessons(transaction, courseId);
    for (let i = 0; i < current.length; i++)
      await transaction.lesson.update({
        where: { id: current[i]!.id },
        data: { order: i + 1 >= order ? i + 2 : i + 1 },
      });
    await transaction.lesson.create({
      data: {
        courseId,
        title: input.title,
        videoUrl: input.videoUrl,
        durationSeconds: input.durationSeconds,
        order,
      },
    });
    return bumpVersion(transaction, courseId);
  });
}
export async function mutateLesson(
  database: PrismaClient,
  lessonId: string,
  input: Partial<LessonFields> & { expectedVersion: number },
  remove = false,
) {
  return database.$transaction(async (transaction) => {
    const lesson = await transaction.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) throw new HttpError(404, 'LESSON_NOT_FOUND', 'This lesson no longer exists.');
    await lockCourse(transaction, lesson.courseId, input.expectedVersion);
    const { expectedVersion: _version, ...data } = input;
    if (remove) {
      await transaction.lesson.delete({ where: { id: lessonId } });
      const remaining = await transaction.lesson.findMany({
        where: { courseId: lesson.courseId },
        orderBy: { order: 'asc' },
      });
      await parkLessons(transaction, lesson.courseId);
      for (let i = 0; i < remaining.length; i++)
        await transaction.lesson.update({
          where: { id: remaining[i]!.id },
          data: { order: i + 1 },
        });
    } else await transaction.lesson.update({ where: { id: lessonId }, data });
    return bumpVersion(transaction, lesson.courseId);
  });
}
export async function reorderLessons(
  database: PrismaClient,
  courseId: string,
  input: { expectedVersion: number; lessonIds: string[] },
) {
  return database.$transaction(async (transaction) => {
    await lockCourse(transaction, courseId, input.expectedVersion);
    const current = await transaction.lesson.findMany({
      where: { courseId },
      select: { id: true },
    });
    const owned = new Set(current.map((lesson) => lesson.id));
    if (
      owned.size !== input.lessonIds.length ||
      new Set(input.lessonIds).size !== owned.size ||
      input.lessonIds.some((id) => !owned.has(id))
    )
      throw new HttpError(
        400,
        'INVALID_ORDER',
        'Provide every lesson ID in this course exactly once.',
      );
    await parkLessons(transaction, courseId);
    for (let i = 0; i < input.lessonIds.length; i++)
      await transaction.lesson.update({
        where: { id: input.lessonIds[i]! },
        data: { order: i + 1 },
      });
    return bumpVersion(transaction, courseId);
  });
}
