import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from 'react';
import { useAuth } from './auth-context';
import { apiRequest, ApiError } from './api';
import { coursePayload, fetchCoursePage, fromDto, type CourseDto } from './content-api';
import {
  defaultState,
  type Course,
  type DemoState,
  type Enrollment,
  type LessonProgress,
} from './data';

export interface LearningSummary {
  progressPercent: number;
  completedLessons: number;
  totalLessons: number;
  savedSeconds: number;
}
export interface LearnerStats {
  enrolled: number;
  active: number;
  completed: number;
  savedSeconds: number;
}
type DemoContext = {
  state: DemoState;
  stats: LearnerStats;
  saveStatus: 'idle' | 'saving' | 'error';
  saveError: string;
  retryProgress: () => void;
  hydrateProgress: (lessonId: string, progress: LessonProgress | null) => void;
  notice: string;
  notify: (message: string) => void;
  dismissNotice: () => void;
  loading: boolean;
  error: string;
  reload: () => void;
  revision: number;
  enroll: (courseId: string) => Promise<void>;
  saveProgress: (lessonId: string, position: number, completed?: boolean) => void;
  saveCourse: (course: Course, isNew: boolean) => Promise<Course>;
  deleteCourse: (course: Course) => Promise<void>;
  percent: (course: Course) => number;
  isEnrolled: (id: string) => boolean;
};
const Context = createContext<DemoContext | null>(null);
export function DemoProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return <ContentProvider key={user?.id || 'guest'}>{children}</ContentProvider>;
}
function ContentProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<DemoState>(() => ({
    ...structuredClone(defaultState),
    progress: {},
  }));
  const [notice, notify] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [stats, setStats] = useState<LearnerStats>({
    enrolled: 0,
    active: 0,
    completed: 0,
    savedSeconds: 0,
  });
  const [learning, setLearning] = useState<Record<string, LearningSummary>>({});
  const learningValues = useRef<Record<string, LearningSummary>>({});
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [saveError, setSaveError] = useState('');
  const confirmed = useRef<DemoState['progress']>({});
  const pending = useRef(new Map<string, { positionSeconds: number; completed: boolean }>());
  const writing = useRef(new Set<string>());
  const conflict = useRef(false);
  const hydrateProgress = (lessonId: string, progress: LessonProgress | null) => {
    if (progress) confirmed.current[lessonId] = progress;
    else delete confirmed.current[lessonId];
    setState((current) => ({ ...current, progress: { ...confirmed.current } }));
  };
  async function flush(lessonId: string) {
    if (writing.current.has(lessonId) || conflict.current) return;
    writing.current.add(lessonId);
    setSaveStatus('saving');
    setSaveError('');
    try {
      while (pending.current.has(lessonId)) {
        const payload = pending.current.get(lessonId)!;
        pending.current.delete(lessonId);
        try {
          const result = await apiRequest<{
            progress: LessonProgress;
            courseId: string;
            learning: LearningSummary;
          }>(`/lessons/${lessonId}/progress`, {
            method: 'PUT',
            keepalive: true,
            body: { ...payload, expectedUpdatedAt: confirmed.current[lessonId]?.updatedAt || null },
          });
          hydrateProgress(lessonId, result.progress);
          learningValues.current = {
            ...learningValues.current,
            [result.courseId]: result.learning,
          };
          setLearning(learningValues.current);
          const values = Object.values(learningValues.current);
          setStats({
            enrolled: values.length,
            active: values.filter((item) => item.progressPercent < 100).length,
            completed: values.filter((item) => item.progressPercent === 100).length,
            savedSeconds: values.reduce((sum, item) => sum + item.savedSeconds, 0),
          });
        } catch (cause) {
          const newer = pending.current.get(lessonId);
          pending.current.set(lessonId, {
            positionSeconds: newer?.positionSeconds ?? payload.positionSeconds,
            completed: payload.completed || !!newer?.completed,
          });
          conflict.current = cause instanceof ApiError && cause.status === 409;
          throw cause;
        }
      }
      setSaveStatus('idle');
    } catch (cause) {
      setSaveStatus('error');
      setSaveError(cause instanceof Error ? cause.message : 'Progress could not be saved.');
    } finally {
      writing.current.delete(lessonId);
    }
  }
  const libraryRequest = useRef(0);
  const loadLibrary = useCallback(async () => {
    const currentRequest = ++libraryRequest.current;
    setLoading(true);
    setError('');
    try {
      // Small LMS summary cache for dashboards; catalog and management use separate paginated queries.
      const first = await fetchCoursePage('', '', 1, 100);
      const courses = [...first.items];
      for (let page = 2; courses.length < first.total; page++) {
        const next = await fetchCoursePage('', '', page, 100);
        if (!next.items.length) break;
        courses.push(...next.items);
      }
      let enrollments: Enrollment[] = [];
      if (user) {
        const own = await apiRequest<{
          enrollments: (Enrollment & { course: CourseDto; learning: LearningSummary })[];
          progress: DemoState['progress'];
          stats: LearnerStats;
        }>('/me/dashboard');
        confirmed.current = own.progress;
        setStats(own.stats);
        learningValues.current = Object.fromEntries(
          own.enrollments.map((item) => [item.courseId, item.learning]),
        );
        setLearning(learningValues.current);
        enrollments = own.enrollments.map(({ courseId, enrolledAt }) => ({ courseId, enrolledAt }));
        for (const entry of own.enrollments) {
          const index = courses.findIndex((course) => course.id === entry.courseId);
          if (index >= 0) courses[index] = fromDto(entry.course);
        }
      }
      if (currentRequest === libraryRequest.current)
        setState((current) => ({
          ...current,
          courses,
          enrollments,
          progress: { ...confirmed.current },
        }));
    } catch (cause) {
      if (currentRequest === libraryRequest.current)
        setError(cause instanceof Error ? cause.message : 'Unable to load the course library.');
    } finally {
      if (currentRequest === libraryRequest.current) setLoading(false);
    }
  }, [user?.id]);
  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => notify(''), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  const value: DemoContext = {
    state: { ...state, user },
    stats,
    saveStatus,
    saveError,
    hydrateProgress,
    retryProgress: () => {
      if (conflict.current) {
        window.location.reload();
        return;
      }
      for (const id of pending.current.keys()) void flush(id);
    },
    notice,
    notify,
    dismissNotice: () => notify(''),
    loading,
    error,
    reload: () => {
      void loadLibrary();
      setRevision((v) => v + 1);
    },
    revision,
    enroll: async (courseId) => {
      await apiRequest(`/courses/${courseId}/enroll`, { method: 'POST', body: {} });
      await loadLibrary();
    },
    saveProgress: (lessonId, position, completed = false) => {
      if (!Number.isFinite(position) || position < 0) return;
      const previous = pending.current.get(lessonId);
      pending.current.set(lessonId, {
        positionSeconds: position,
        completed: completed || !!previous?.completed,
      });
      if (saveStatus !== 'error') void flush(lessonId);
    },
    saveCourse: async (course, isNew) => {
      const result = await apiRequest<{ course: CourseDto }>(
        isNew ? '/admin/courses' : `/admin/courses/${course.id}`,
        {
          method: isNew ? 'POST' : 'PUT',
          body: {
            ...coursePayload(course),
            ...(!isNew ? { expectedVersion: course.version } : {}),
          },
        },
      );
      setRevision((v) => v + 1);
      void loadLibrary();
      return fromDto(result.course);
    },
    deleteCourse: async (course) => {
      await apiRequest<void>(`/admin/courses/${course.id}`, {
        method: 'DELETE',
        body: { expectedVersion: course.version },
      });
      setRevision((v) => v + 1);
      await loadLibrary();
    },
    percent: (course) => learning[course.id]?.progressPercent || 0,
    isEnrolled: (id) => state.enrollments.some((enrollment) => enrollment.courseId === id),
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useDemo() {
  const value = useContext(Context);
  if (!value) throw new Error('DemoProvider is required');
  return value;
}
