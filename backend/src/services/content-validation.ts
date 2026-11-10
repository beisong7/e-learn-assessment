import { z } from 'zod';
import { HttpError } from '../middleware/http-error.js';

export const emptyBodySchema = z.object({}).strict();
export const idSchema = z.string().uuid();
const httpUrl = z
  .string()
  .trim()
  .max(4096)
  .refine((value) => {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  }, 'Use a valid HTTP(S) URL without credentials');
export const courseFields = z.object({
  title: z.string().trim().min(1).max(140),
  description: z.string().trim().min(1).max(10000),
  category: z.enum(['DESIGN', 'DEVELOPMENT', 'DATA_SCIENCE', 'BUSINESS']),
  thumbnailUrl: httpUrl,
  instructorName: z.string().trim().min(1).max(120),
  level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ALL_LEVELS']),
  outcomes: z.array(z.string().trim().min(1).max(300)).max(20),
});
export const lessonFields = z.object({
  title: z.string().trim().min(1).max(140),
  videoUrl: httpUrl,
  durationSeconds: z.number().int().min(1).max(604800),
});
const fullLesson = lessonFields
  .extend({ id: idSchema.optional(), order: z.number().int().min(1).max(500) })
  .strict();
const lessons = z
  .array(fullLesson)
  .max(500)
  .superRefine((items, context) => {
    const ids = new Set<string>();
    items.forEach((lesson, index) => {
      if (lesson.order !== index + 1)
        context.addIssue({
          code: 'custom',
          message: 'Lesson order must match its array position, starting at 1',
          path: [index, 'order'],
        });
      if (lesson.id && ids.has(lesson.id))
        context.addIssue({ code: 'custom', message: 'Duplicate lesson ID', path: [index, 'id'] });
      if (lesson.id) ids.add(lesson.id);
    });
  });
export const createCourseSchema = courseFields.extend({ lessons: lessons.default([]) }).strict();
export const replaceCourseSchema = courseFields
  .extend({ lessons, expectedVersion: z.number().int().positive() })
  .strict();
export const patchCourseSchema = courseFields
  .partial()
  .extend({ expectedVersion: z.number().int().positive() })
  .strict();
export const createLessonSchema = lessonFields
  .extend({
    order: z.number().int().min(1).max(500).optional(),
    expectedVersion: z.number().int().positive(),
  })
  .strict();
export const patchLessonSchema = lessonFields
  .partial()
  .extend({ expectedVersion: z.number().int().positive() })
  .strict();
export const versionSchema = z.object({ expectedVersion: z.number().int().positive() }).strict();
export const orderSchema = versionSchema.extend({ lessonIds: z.array(idSchema).max(500) }).strict();
export const listSchema = z
  .object({
    q: z.string().trim().max(200).default(''),
    category: z.enum(['DESIGN', 'DEVELOPMENT', 'DATA_SCIENCE', 'BUSINESS']).optional(),
    page: z.coerce.number().int().positive().max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(9),
  })
  .strict();
export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type ReplaceCourseInput = z.infer<typeof replaceCourseSchema>;
export function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) fields[issue.path.join('.') || 'form'] = issue.message;
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      Object.values(fields)[0] || 'Invalid request.',
      fields,
    );
  }
  return result.data;
}
