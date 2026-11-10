import { useEffect, useState } from 'react';
import { fetchCourse, fetchCoursePage, type CoursePage } from './content-api';
import type { Course } from './data';
import { useDemo } from './store';

export function useCourseList(
  query = '',
  category = 'All courses',
  page = 1,
  pageSize = 9,
  admin = false,
) {
  const { revision } = useDemo();
  const [result, setResult] = useState<CoursePage>({ items: [], total: 0, page, pageSize });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const timer = setTimeout(
      () => {
        void fetchCoursePage(query, category, page, pageSize, admin)
          .then((data) => {
            if (active) setResult(data);
          })
          .catch((cause) => {
            if (active)
              setError(cause instanceof Error ? cause.message : 'Unable to load courses.');
          })
          .finally(() => {
            if (active) setLoading(false);
          });
      },
      query ? 200 : 0,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, category, page, pageSize, admin, revision, retry]);
  return { ...result, loading, error, reload: () => setRetry((value) => value + 1) };
}
export function useCourse(id?: string, admin = false) {
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoading(true);
    setError('');
    void fetchCourse(id, admin)
      .then((data) => {
        if (active) setCourse(data);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load course.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, admin, retry]);
  return { course, loading, error, reload: () => setRetry((value) => value + 1) };
}
