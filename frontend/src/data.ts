export type Category = 'Design' | 'Development' | 'Data Science' | 'Business';
export type UserRole = 'learner' | 'admin';
export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}
export interface Lesson {
  id: string;
  title: string;
  durationSeconds: number;
  videoUrl?: string;
  order: number;
}
export interface Course {
  version?: number;
  durationSeconds?: number;
  lessonCount?: number;
  id: string;
  title: string;
  description: string;
  category: Category;
  thumbnailUrl: string;
  instructor: string;
  level: string;
  outcomes: string[];
  lessons: Lesson[];
}
export interface Enrollment {
  courseId: string;
  enrolledAt: string;
}
export interface LessonProgress {
  positionSeconds: number;
  completed: boolean;
  updatedAt: string;
}
export interface DemoState {
  version: 1;
  user: User | null;
  courses: Course[];
  enrollments: Enrollment[];
  progress: Record<string, LessonProgress>;
}

export const categories: Category[] = ['Design', 'Development', 'Data Science', 'Business'];
export const defaultState: DemoState = {
  version: 1,
  user: null,
  courses: [],
  enrollments: [],
  progress: {},
};
export const courseDuration = (course: Course) =>
  course.durationSeconds ?? course.lessons.reduce((sum, lesson) => sum + lesson.durationSeconds, 0);
export const lessonCount = (course: Course) => course.lessonCount ?? course.lessons.length;
export function formatDuration(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  const minutes = Math.round(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes} min`;
}
export function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0')}`;
}
