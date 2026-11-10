import { apiRequest } from './api';
import type { Category, Course, Lesson } from './data';

export const categoryCodes: Record<Category, string> = {
  Design: 'DESIGN',
  Development: 'DEVELOPMENT',
  'Data Science': 'DATA_SCIENCE',
  Business: 'BUSINESS',
};
const categoryLabels = Object.fromEntries(
  Object.entries(categoryCodes).map(([label, code]) => [code, label]),
) as Record<string, Category>;
const levelCodes: Record<string, string> = {
  'Beginner friendly': 'BEGINNER',
  'Some experience': 'INTERMEDIATE',
  'All levels': 'ALL_LEVELS',
};
const levelLabels = Object.fromEntries(
  Object.entries(levelCodes).map(([label, code]) => [code, label]),
);
export interface CourseDto {
  id: string;
  version: number;
  title: string;
  description: string;
  category: string;
  thumbnailUrl: string;
  instructorName: string;
  level: string;
  outcomes: string[];
  durationSeconds: number;
  lessonCount: number;
  lessons?: Lesson[];
}
export interface CoursePage {
  items: Course[];
  total: number;
  page: number;
  pageSize: number;
}
export function fromDto(course: CourseDto): Course {
  return {
    ...course,
    category: categoryLabels[course.category],
    instructor: course.instructorName,
    level: levelLabels[course.level],
    lessons: course.lessons || [],
  };
}
export async function fetchCoursePage(
  query = '',
  category = '',
  page = 1,
  pageSize = 9,
  admin = false,
): Promise<CoursePage> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (query.trim()) params.set('q', query.trim());
  if (category && category !== 'All courses')
    params.set('category', categoryCodes[category as Category] || category);
  const result = await apiRequest<Omit<CoursePage, 'items'> & { items: CourseDto[] }>(
    `${admin ? '/admin' : ''}/courses?${params}`,
  );
  return { ...result, items: result.items.map(fromDto) };
}
export async function fetchCourse(id: string, admin = false) {
  const result = await apiRequest<{ course: CourseDto }>(
    `${admin ? '/admin' : ''}/courses/${encodeURIComponent(id)}`,
  );
  return fromDto(result.course);
}
export function coursePayload(course: Course) {
  return {
    title: course.title,
    description: course.description,
    category: categoryCodes[course.category],
    thumbnailUrl: course.thumbnailUrl,
    instructorName: course.instructor,
    level: levelCodes[course.level],
    outcomes: course.outcomes,
    lessons: course.lessons.map((lesson, index) => ({
      id: lesson.id,
      title: lesson.title,
      videoUrl: lesson.videoUrl,
      durationSeconds: lesson.durationSeconds,
      order: index + 1,
    })),
  };
}
