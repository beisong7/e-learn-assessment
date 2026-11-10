import type { PrismaClient } from '@prisma/client';
import { HttpError } from '../middleware/http-error.js';
import { publicDetailSelect, summarize } from '../repositories/courses.js';

type Progress = { lessonId: string; positionSeconds: number; completed: boolean };
export function courseProgress(
  lessons: { id: string; durationSeconds: number }[],
  progress: Progress[],
) {
  const byLesson = new Map(progress.map((item) => [item.lessonId, item]));
  const completedLessons = lessons.filter((lesson) => byLesson.get(lesson.id)?.completed).length;
  return {
    completedLessons,
    totalLessons: lessons.length,
    progressPercent: lessons.length
      ? completedLessons === lessons.length
        ? 100
        : Math.min(99, Math.round((completedLessons / lessons.length) * 100))
      : 0,
    savedSeconds: lessons.reduce(
      (sum, lesson) =>
        sum + Math.min(lesson.durationSeconds, byLesson.get(lesson.id)?.positionSeconds || 0),
      0,
    ),
  };
}

export async function saveLessonProgress(
  database: PrismaClient,
  userId: string,
  lessonId: string,
  input: { positionSeconds: number; completed: boolean; expectedUpdatedAt: string | null },
) {
  return database.$transaction(async (transaction) => {
    const lesson = await transaction.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) throw new HttpError(404, 'LESSON_NOT_FOUND', 'This lesson no longer exists.');
    const enrolled = await transaction.$queryRaw<
      { id: string }[]
    >`SELECT id FROM enrollments WHERE user_id = ${userId}::uuid AND course_id = ${lesson.courseId}::uuid FOR UPDATE`;
    if (!enrolled.length)
      throw new HttpError(
        403,
        'ENROLLMENT_REQUIRED',
        'Enroll in this course before saving progress.',
      );
    const where = { userId_lessonId: { userId, lessonId } };
    const current = await transaction.lessonProgress.findUnique({ where });
    if ((current?.updatedAt.toISOString() || null) !== input.expectedUpdatedAt)
      throw new HttpError(
        409,
        'PROGRESS_CONFLICT',
        'Progress changed in another window. Reload this lesson to continue.',
      );
    const completed = !!current?.completed || input.completed;
    const updatedAt = new Date(Math.max(Date.now(), (current?.updatedAt.getTime() || 0) + 1));
    const data = {
      positionSeconds: Math.min(input.positionSeconds, lesson.durationSeconds),
      completed,
      completedAt: current?.completedAt || (completed ? updatedAt : null),
      updatedAt,
    };
    const progress = await transaction.lessonProgress.upsert({
      where,
      create: { userId, lessonId, courseId: lesson.courseId, ...data },
      update: data,
    });
    const lessons = await transaction.lesson.findMany({
      where: { courseId: lesson.courseId },
      select: { id: true, durationSeconds: true },
    });
    const rows = await transaction.lessonProgress.findMany({
      where: { userId, courseId: lesson.courseId },
    });
    return { progress, courseId: lesson.courseId, learning: courseProgress(lessons, rows) };
  });
}

export async function learnerDashboard(database: PrismaClient, userId: string) {
  const enrollments = await database.enrollment.findMany({
    where: { userId },
    include: { course: { select: publicDetailSelect }, progress: true },
    orderBy: { enrolledAt: 'desc' },
  });
  const items = enrollments.map((entry) => ({
    courseId: entry.courseId,
    enrolledAt: entry.enrolledAt,
    course: { ...summarize(entry.course), lessons: entry.course.lessons },
    learning: courseProgress(entry.course.lessons, entry.progress),
  }));
  return {
    enrollments: items,
    progress: Object.fromEntries(
      enrollments.flatMap((entry) =>
        entry.progress.map((item) => [
          item.lessonId,
          {
            positionSeconds: Math.min(
              item.positionSeconds,
              entry.course.lessons.find((lesson) => lesson.id === item.lessonId)?.durationSeconds ||
                0,
            ),
            completed: item.completed,
            updatedAt: item.updatedAt,
          },
        ]),
      ),
    ),
    stats: {
      enrolled: items.length,
      active: items.filter((item) => item.learning.progressPercent < 100).length,
      completed: items.filter((item) => item.learning.progressPercent === 100).length,
      savedSeconds: items.reduce((sum, item) => sum + item.learning.savedSeconds, 0),
    },
  };
}

export async function adminDashboard(database: PrismaClient, page: number, pageSize: number) {
  const [courses, enrollments, learners] = await Promise.all([
    database.course.findMany({
      select: publicDetailSelect,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
    database.enrollment.findMany({
      where: { user: { role: 'LEARNER' } },
      include: {
        user: { select: { id: true, name: true, email: true } },
        course: { select: publicDetailSelect },
        progress: true,
      },
      orderBy: [{ enrolledAt: 'desc' }, { id: 'asc' }],
    }),
    database.user.count({ where: { role: 'LEARNER' } }),
  ]);
  const rows = enrollments.map((entry) => ({
    userId: entry.user.id,
    name: entry.user.name,
    email: entry.user.email,
    courseId: entry.courseId,
    courseTitle: entry.course.title,
    ...courseProgress(entry.course.lessons, entry.progress),
  }));
  return {
    stats: {
      courses: courses.length,
      lessons: courses.reduce((sum, course) => sum + course.lessons.length, 0),
      learners,
      enrollments: rows.length,
      completed: rows.filter((row) => row.progressPercent === 100).length,
    },
    courses: courses.map((course) => {
      const activity = rows.filter((row) => row.courseId === course.id);
      return {
        id: course.id,
        title: course.title,
        category: course.category,
        lessonCount: course.lessons.length,
        enrollments: activity.length,
        completed: activity.filter((row) => row.progressPercent === 100).length,
        averageProgress: activity.length
          ? Math.round(
              activity.reduce((sum, row) => sum + row.progressPercent, 0) / activity.length,
            )
          : 0,
      };
    }),
    learners: rows.slice((page - 1) * pageSize, page * pageSize),
    total: rows.length,
    page,
    pageSize,
  };
}
