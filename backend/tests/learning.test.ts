import { describe, expect, it } from 'vitest';
import { courseProgress } from '../src/services/learning.js';
const lessons = [
  { id: 'a', durationSeconds: 60 },
  { id: 'b', durationSeconds: 30 },
];
describe('course progress', () => {
  it('returns zero for empty and not-started courses', () => {
    expect(courseProgress([], []).progressPercent).toBe(0);
    expect(courseProgress(lessons, []).progressPercent).toBe(0);
  });
  it('counts current completed lessons and caps saved time at duration', () => {
    expect(
      courseProgress(lessons, [
        { lessonId: 'a', completed: true, positionSeconds: 100 },
        { lessonId: 'deleted', completed: true, positionSeconds: 100 },
      ]),
    ).toEqual({ totalLessons: 2, completedLessons: 1, progressPercent: 50, savedSeconds: 60 });
  });
  it('never rounds an unfinished course to 100 percent', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ id: String(i), durationSeconds: 1 }));
    expect(
      courseProgress(
        many,
        many
          .slice(0, 199)
          .map((lesson) => ({ lessonId: lesson.id, completed: true, positionSeconds: 1 })),
      ).progressPercent,
    ).toBe(99);
    expect(
      courseProgress(
        many,
        many.map((lesson) => ({ lessonId: lesson.id, completed: true, positionSeconds: 1 })),
      ).progressPercent,
    ).toBe(100);
  });
});
