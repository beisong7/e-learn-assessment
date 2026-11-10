import type { PrismaClient } from '@prisma/client';
import courseData from './course-seed.json' with { type: 'json' };
import { createCourseSchema, parseInput } from '../services/content-validation.js';

export async function seedCourses(database: PrismaClient, samples = courseData) {
  for (const sample of samples) {
    const { id, ...fields } = sample;
    const input = parseInput(createCourseSchema, fields);
    // Reruns preserve admin edits, removed lessons, and existing learner progress.
    await database.course.upsert({
      where: { id },
      update: {},
      create: { ...input, id, lessons: { create: input.lessons } },
    });
  }
  return samples.length;
}
