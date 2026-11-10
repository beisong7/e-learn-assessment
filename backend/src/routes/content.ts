import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { publicCourse, publicDetailSelect, summarize } from '../repositories/courses.js';
import * as content from '../services/content.js';
import {
  emptyBodySchema,
  parseInput,
  idSchema,
  listSchema,
  createCourseSchema,
  replaceCourseSchema,
  patchCourseSchema,
  createLessonSchema,
  patchLessonSchema,
  versionSchema,
  orderSchema,
} from '../services/content-validation.js';
import { requireSession } from '../middleware/auth.js';
import { HttpError } from '../middleware/http-error.js';

export function publicContentRouter(database: PrismaClient, origin: string) {
  const router = Router();
  router.get('/courses', async (request, response) => {
    response.json(await content.listCourses(database, parseInput(listSchema, request.query)));
  });
  router.get('/courses/:courseId', async (request, response) => {
    response.json({
      course: await publicCourse(database, parseInput(idSchema, request.params.courseId)),
    });
  });
  // Enrollment is the prerequisite for returning a lesson's protected video URL.
  router.post('/courses/:courseId/enroll', requireSession(database), async (request, response) => {
    if (request.get('origin') !== origin)
      throw new HttpError(
        403,
        'UNTRUSTED_ORIGIN',
        'This request did not originate from the application.',
      );
    if (!request.is('application/json'))
      throw new HttpError(415, 'JSON_REQUIRED', 'Send requests as application/json.');
    parseInput(emptyBodySchema, request.body);
    const courseId = parseInput(idSchema, request.params.courseId);
    await publicCourse(database, courseId);
    const enrollment = await database.enrollment.upsert({
      where: { userId_courseId: { userId: response.locals.user!.id, courseId } },
      create: { userId: response.locals.user!.id, courseId },
      update: {},
    });
    response.status(200).json({ enrollment: { courseId, enrolledAt: enrollment.enrolledAt } });
  });
  router.get('/me/enrollments', requireSession(database), async (_request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    const enrollments = await database.enrollment.findMany({
      where: { userId: response.locals.user!.id },
      include: { course: { select: publicDetailSelect } },
      orderBy: { enrolledAt: 'desc' },
    });
    response.json({
      enrollments: enrollments.map((enrollment) => ({
        courseId: enrollment.courseId,
        enrolledAt: enrollment.enrolledAt,
        course: { ...summarize(enrollment.course), lessons: enrollment.course.lessons },
      })),
    });
  });
  router.get('/lessons/:lessonId', requireSession(database), async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    const id = parseInput(idSchema, request.params.lessonId);
    const lesson = await database.lesson.findUnique({ where: { id } });
    if (!lesson) throw new HttpError(404, 'LESSON_NOT_FOUND', 'This lesson no longer exists.');
    const user = response.locals.user!;
    if (
      user.role !== 'admin' &&
      !(await database.enrollment.findUnique({
        where: { userId_courseId: { userId: user.id, courseId: lesson.courseId } },
      }))
    )
      throw new HttpError(
        403,
        'ENROLLMENT_REQUIRED',
        'Enroll in this course to watch its lessons.',
      );
    const progress = await database.lessonProgress.findUnique({
      where: { userId_lessonId: { userId: user.id, lessonId: id } },
    });
    response.json({
      lesson,
      progress: progress
        ? {
            positionSeconds: Math.min(progress.positionSeconds, lesson.durationSeconds),
            completed: progress.completed,
            updatedAt: progress.updatedAt,
          }
        : null,
    });
  });
  return router;
}
export function adminContentRouter(database: PrismaClient) {
  const router = Router();
  router.use((request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    if (
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) &&
      !request.is('application/json')
    )
      throw new HttpError(415, 'JSON_REQUIRED', 'Send requests as application/json.');
    next();
  });
  router.get('/courses', async (request, response) => {
    response.json(await content.listCourses(database, parseInput(listSchema, request.query)));
  });
  router.get('/courses/:courseId', async (request, response) => {
    response.json({
      course: await content.adminCourse(database, parseInput(idSchema, request.params.courseId)),
    });
  });
  router.post('/courses', async (request, response) => {
    response.status(201).json({
      course: await content.createCourse(database, parseInput(createCourseSchema, request.body)),
    });
  });
  router.put('/courses/:courseId', async (request, response) => {
    response.json({
      course: await content.replaceCourse(
        database,
        parseInput(idSchema, request.params.courseId),
        parseInput(replaceCourseSchema, request.body),
      ),
    });
  });
  router.patch('/courses/:courseId', async (request, response) => {
    response.json({
      course: await content.patchCourse(
        database,
        parseInput(idSchema, request.params.courseId),
        parseInput(patchCourseSchema, request.body),
      ),
    });
  });
  router.delete('/courses/:courseId', async (request, response) => {
    await content.deleteCourse(
      database,
      parseInput(idSchema, request.params.courseId),
      parseInput(versionSchema, request.body).expectedVersion,
    );
    response.status(204).end();
  });
  router.post('/courses/:courseId/lessons', async (request, response) => {
    response.status(201).json({
      course: await content.createLesson(
        database,
        parseInput(idSchema, request.params.courseId),
        parseInput(createLessonSchema, request.body),
      ),
    });
  });
  router.put('/courses/:courseId/lesson-order', async (request, response) => {
    response.json({
      course: await content.reorderLessons(
        database,
        parseInput(idSchema, request.params.courseId),
        parseInput(orderSchema, request.body),
      ),
    });
  });
  router.patch('/lessons/:lessonId', async (request, response) => {
    response.json({
      course: await content.mutateLesson(
        database,
        parseInput(idSchema, request.params.lessonId),
        parseInput(patchLessonSchema, request.body),
      ),
    });
  });
  router.delete('/lessons/:lessonId', async (request, response) => {
    response.json({
      course: await content.mutateLesson(
        database,
        parseInput(idSchema, request.params.lessonId),
        parseInput(versionSchema, request.body),
        true,
      ),
    });
  });
  return router;
}
