import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  CirclePlus,
  Eye,
  Layers3,
  Pencil,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  categories,
  courseDuration,
  lessonCount,
  formatDuration,
  type Category,
  type Course,
  type Lesson,
} from './data';
import { EmptyState, Pagination, Progress, RequestState, SectionHeading } from './components';
import { useCourse, useCourseList } from './content-hooks';
import { apiRequest } from './api';
import { useDemo } from './store';

interface AdminReport {
  stats: {
    courses: number;
    lessons: number;
    learners: number;
    enrollments: number;
    completed: number;
  };
  courses: {
    id: string;
    title: string;
    lessonCount: number;
    enrollments: number;
    averageProgress: number;
  }[];
  learners: {
    userId: string;
    name: string;
    email: string;
    courseId: string;
    courseTitle: string;
    progressPercent: number;
  }[];
  total: number;
}
export function AdminDashboard() {
  const [report, setReport] = useState<AdminReport | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void apiRequest<AdminReport>(`/admin/dashboard?page=${page}&pageSize=20`)
      .then((data) => {
        if (active) setReport(data);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load activity.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, retry]);
  if (loading || error || !report)
    return (
      <RequestState loading={loading} error={error} retry={() => setRetry((value) => value + 1)} />
    );
  return (
    <>
      <div className="page-heading">
        <span className="overline">ADMIN WORKSPACE / OVERVIEW</span>
        <h1>A space to help people grow.</h1>
        <p>Course activity and learner progress, saved across the platform.</p>
      </div>
      <div className="stats-grid">
        {[
          { label: 'Courses', value: report.stats.courses, icon: BookOpen },
          { label: 'Video lessons', value: report.stats.lessons, icon: Layers3 },
          { label: 'Learners', value: report.stats.learners, icon: Users },
          { label: 'Enrollments', value: report.stats.enrollments, icon: CheckCircle2 },
        ].map((item) => (
          <div className="stat" key={item.label}>
            <div>
              <span>{item.label}</span>
              <item.icon size={19} />
            </div>
            <strong>{item.value}</strong>
            <small>Platform totals</small>
          </div>
        ))}
      </div>
      <section className="panel">
        <SectionHeading
          title="Course activity"
          description={`${report.stats.completed} completed learner enrollments`}
          action={{ label: 'Manage courses', to: '/admin/courses' }}
        />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Course</th>
                <th>Lessons</th>
                <th>Enrollments</th>
                <th>Average progress</th>
              </tr>
            </thead>
            <tbody>
              {report.courses.map((course) => (
                <tr key={course.id}>
                  <td>
                    <Link to={`/courses/${course.id}`}>
                      <strong>{course.title}</strong>
                    </Link>
                  </td>
                  <td>{course.lessonCount}</td>
                  <td>{course.enrollments}</td>
                  <td>
                    <div className="table-progress">
                      <Progress value={course.averageProgress} />
                      <span>{course.averageProgress}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!report.courses.length && (
          <p className="muted">No courses yet. Create a course to get started.</p>
        )}
      </section>
      <section className="panel admin-learners">
        <SectionHeading
          title="Learner progress"
          description="Completion for each learner’s enrolled courses."
        />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Learner</th>
                <th>Course</th>
                <th>Progress</th>
              </tr>
            </thead>
            <tbody>
              {report.learners.map((row) => (
                <tr key={`${row.userId}:${row.courseId}`}>
                  <td>
                    <strong>{row.name}</strong>
                    <small>{row.email}</small>
                  </td>
                  <td>{row.courseTitle}</td>
                  <td>{row.progressPercent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!report.learners.length && <p className="muted">Learner enrollments will appear here.</p>}
        <Pagination page={page} pageSize={20} total={report.total} onPage={setPage} />
      </section>
    </>
  );
}
export function ManageCourses() {
  const { deleteCourse, notify } = useDemo();
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const result = useCourseList(query, 'All courses', page, 10, true);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  useEffect(() => {
    if (!result.loading && !result.items.length && page > 1) setPage((value) => value - 1);
  }, [result.loading, result.items.length, page]);
  const [pendingDelete, setPendingDelete] = useState<Course | null>(null);
  return (
    <>
      <div className="page-heading heading-with-action">
        <div>
          <span className="overline">ADMIN WORKSPACE / CONTENT</span>
          <h1>Make space for learning.</h1>
          <p>Create, refine, and organize your course library.</p>
        </div>
        <Link className="button primary" to="/admin/courses/new">
          <Plus size={17} />
          Create course
        </Link>
      </div>
      <label className="search-field">
        <input
          aria-label="Search managed courses"
          placeholder="Search your course library…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
        />
      </label>
      <RequestState loading={result.loading} error={result.error} retry={result.reload} />
      {!result.loading && !result.error && (
        <section className="panel">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Category</th>
                  <th>Lessons</th>
                  <th>Duration</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="table-course">
                        <img src={c.thumbnailUrl} alt="" />
                        <div>
                          <strong>{c.title}</strong>
                          <small>{c.instructor}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="status-badge">{c.category}</span>
                    </td>
                    <td>{lessonCount(c)}</td>
                    <td>{formatDuration(courseDuration(c))}</td>
                    <td>
                      <div className="table-actions">
                        <Link
                          className="icon-button"
                          to={`/courses/${c.id}`}
                          aria-label={`Preview ${c.title}`}
                        >
                          <Eye size={16} />
                        </Link>
                        <Link
                          className="icon-button"
                          to={`/admin/courses/${c.id}/edit`}
                          aria-label={`Edit ${c.title}`}
                        >
                          <Pencil size={16} />
                        </Link>
                        <button
                          className="icon-button danger"
                          onClick={() => setPendingDelete(c)}
                          aria-label={`Delete ${c.title}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!result.items.length && (
            <EmptyState
              title="Your library starts here"
              description="Add your first course and give curiosity somewhere to go."
              to="/admin/courses/new"
              label="Create a course"
            />
          )}
        </section>
      )}
      <Pagination page={page} pageSize={10} total={result.total} onPage={setPage} />
      {pendingDelete && (
        <DeleteConfirmation
          course={pendingDelete}
          busy={deleting}
          error={deleteError}
          cancel={() => {
            if (!deleting) {
              setPendingDelete(null);
              setDeleteError('');
            }
          }}
          confirm={async () => {
            setDeleting(true);
            setDeleteError('');
            try {
              await deleteCourse(pendingDelete);
              setPendingDelete(null);
              notify('Course deleted.');
            } catch (cause) {
              setDeleteError(cause instanceof Error ? cause.message : 'Unable to delete course.');
              result.reload();
            } finally {
              setDeleting(false);
            }
          }}
        />
      )}
    </>
  );
}

function DeleteConfirmation({
  course,
  cancel,
  confirm,
  busy,
  error,
}: {
  busy: boolean;
  error: string;
  course: Course;
  cancel: () => void;
  confirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="confirm-dialog"
      aria-labelledby="delete-title"
      onCancel={(event) => {
        event.preventDefault();
        cancel();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) cancel();
      }}
    >
      <span className="delete-icon">
        <Trash2 size={26} />
      </span>
      <h2 id="delete-title">Delete this course?</h2>
      <p>
        “{course.title}” and its lessons, enrollments, and saved progress will be permanently
        removed.
      </p>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div>
        <button autoFocus disabled={busy} className="button secondary" onClick={cancel}>
          Keep course
        </button>
        <button disabled={busy} className="button danger-button" onClick={confirm}>
          {busy ? 'Deleting…' : 'Delete course'}
        </button>
      </div>
    </dialog>
  );
}
function emptyCourse(): Course {
  return {
    id: crypto.randomUUID(),
    title: '',
    description: '',
    category: 'Design',
    thumbnailUrl: '',
    instructor: '',
    level: 'Beginner friendly',
    outcomes: [''],
    lessons: [],
  };
}
export function CourseEditor() {
  const { courseId } = useParams();
  const result = useCourse(courseId, true);
  if (result.loading || result.error)
    return <RequestState loading={result.loading} error={result.error} retry={result.reload} />;
  if (courseId && !result.course)
    return (
      <EmptyState
        title="Course not found"
        description="This course may have been removed."
        to="/admin/courses"
        label="Back to courses"
      />
    );
  return (
    <CourseEditorForm
      key={`${courseId || 'new'}:${result.course?.version || 0}`}
      existing={result.course || undefined}
      reload={result.reload}
    />
  );
}
function CourseEditorForm({ existing, reload }: { existing?: Course; reload: () => void }) {
  const { saveCourse, notify } = useDemo();
  const [draft, setDraft] = useState<Course>(() =>
    existing ? structuredClone(existing) : emptyCourse(),
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  function update<K extends keyof Course>(key: K, value: Course[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  function updateLesson(id: string, patch: Partial<Lesson>) {
    update(
      'lessons',
      draft.lessons.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    );
  }
  function moveLesson(index: number, offset: number) {
    const items = [...draft.lessons];
    const target = index + offset;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    update(
      'lessons',
      items.map((l, i) => ({ ...l, order: i + 1 })),
    );
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft.title.trim() || !draft.description.trim() || !draft.instructor.trim()) {
      setError('Add a course title, description, and instructor.');
      return;
    }
    const validUrl = (value?: string) => {
      try {
        return !!value && ['https:', 'http:'].includes(new URL(value).protocol);
      } catch {
        return false;
      }
    };
    if (
      !validUrl(draft.thumbnailUrl) ||
      draft.lessons.some(
        (l) =>
          !l.title.trim() ||
          !validUrl(l.videoUrl) ||
          !Number.isFinite(l.durationSeconds) ||
          l.durationSeconds <= 0,
      )
    ) {
      setError(
        'Use valid HTTP(S) image/video URLs and a title and positive duration for every lesson.',
      );
      return;
    }
    setSaving(true);
    setError('');
    try {
      await saveCourse(
        {
          ...draft,
          title: draft.title.trim(),
          description: draft.description.trim(),
          instructor: draft.instructor.trim(),
          outcomes: draft.outcomes.map((o) => o.trim()).filter(Boolean),
          lessons: draft.lessons.map((l, i) => ({ ...l, title: l.title.trim(), order: i + 1 })),
        },
        !existing,
      );
      notify(
        existing
          ? 'Course updated. A little better, every time.'
          : 'Your new course is ready to explore.',
      );
      navigate('/admin/courses');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to save. Your draft is still here.',
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <Link className="back-link" to="/admin/courses">
        <ArrowLeft size={15} />
        Back to course management
      </Link>
      <div className="page-heading">
        <span className="overline">
          ADMIN WORKSPACE / {existing ? 'EDIT COURSE' : 'NEW COURSE'}
        </span>
        <h1>{existing ? 'A little better, every time.' : 'Give curiosity a place to go.'}</h1>
        <p>Shape the course, then build the learning path.</p>
      </div>
      <form className="course-editor" onSubmit={save} aria-busy={saving}>
        <fieldset className="editor-fields" disabled={saving}>
          <section className="panel">
            <SectionHeading
              title="The big picture"
              description="Help learners discover what’s possible."
            />
            <div className="form-grid">
              <label className="span-two">
                Course title
                <input
                  required
                  maxLength={140}
                  value={draft.title}
                  onChange={(e) => update('title', e.target.value)}
                  placeholder="e.g. UI/UX Design Fundamentals"
                />
              </label>
              <label className="span-two">
                Description
                <textarea
                  required
                  rows={4}
                  value={draft.description}
                  onChange={(e) => update('description', e.target.value)}
                  placeholder="What will learners explore?"
                />
              </label>
              <label>
                Category
                <select
                  value={draft.category}
                  onChange={(e) => update('category', e.target.value as Category)}
                >
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Level
                <select value={draft.level} onChange={(e) => update('level', e.target.value)}>
                  {['Beginner friendly', 'Some experience', 'All levels'].map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </label>
              <label>
                Instructor name
                <input
                  required
                  value={draft.instructor}
                  onChange={(e) => update('instructor', e.target.value)}
                  placeholder="Course guide"
                />
              </label>
              <label>
                Thumbnail URL
                <input
                  type="url"
                  required
                  value={draft.thumbnailUrl}
                  onChange={(e) => update('thumbnailUrl', e.target.value)}
                  placeholder="https://…"
                />
              </label>
              <label className="span-two">
                Learning outcomes <span className="muted">(one per line)</span>
                <textarea
                  rows={3}
                  value={draft.outcomes.join('\n')}
                  onChange={(e) => update('outcomes', e.target.value.split('\n'))}
                  placeholder="What will learners take away?"
                />
              </label>
            </div>
          </section>
          <section className="panel">
            <SectionHeading
              title="The learning path"
              description="Add video lessons and arrange them in a helpful order."
            />
            {draft.lessons.map((l, i) => (
              <article className="lesson-editor" key={l.id}>
                <div className="lesson-editor-head">
                  <strong>Lesson {String(i + 1).padStart(2, '0')}</strong>
                  <div>
                    <button
                      type="button"
                      className="icon-button"
                      disabled={i === 0}
                      onClick={() => moveLesson(i, -1)}
                      aria-label={`Move lesson ${i + 1} up`}
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      disabled={i === draft.lessons.length - 1}
                      onClick={() => moveLesson(i, 1)}
                      aria-label={`Move lesson ${i + 1} down`}
                    >
                      <ArrowDown size={15} />
                    </button>
                    <button
                      type="button"
                      className="icon-button danger"
                      onClick={() =>
                        update(
                          'lessons',
                          draft.lessons
                            .filter((item) => item.id !== l.id)
                            .map((item, order) => ({ ...item, order: order + 1 })),
                        )
                      }
                      aria-label={`Remove lesson ${i + 1}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                <div className="form-grid">
                  <label>
                    Lesson title
                    <input
                      required
                      value={l.title}
                      onChange={(e) => updateLesson(l.id, { title: e.target.value })}
                    />
                  </label>
                  <label>
                    Duration (seconds)
                    <input
                      type="number"
                      min={1}
                      required
                      value={l.durationSeconds}
                      onChange={(e) =>
                        updateLesson(l.id, { durationSeconds: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label className="span-two">
                    Video URL
                    <input
                      type="url"
                      required
                      value={l.videoUrl}
                      onChange={(e) => updateLesson(l.id, { videoUrl: e.target.value })}
                    />
                  </label>
                </div>
              </article>
            ))}
            {!draft.lessons.length && (
              <p className="muted">No lessons yet. Add the first step in this learning journey.</p>
            )}
            <button
              className="button secondary small"
              type="button"
              onClick={() =>
                update('lessons', [
                  ...draft.lessons,
                  {
                    id: crypto.randomUUID(),
                    title: '',
                    durationSeconds: 5,
                    videoUrl:
                      'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
                    order: draft.lessons.length + 1,
                  },
                ])
              }
            >
              <CirclePlus size={17} />
              Add lesson
            </button>
          </section>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <div className="editor-actions">
            <Link className="button secondary" to="/admin/courses">
              Cancel
            </Link>
            <button type="submit" className="button primary">
              {saving ? 'Saving…' : existing ? 'Save changes' : 'Create course'}
              <ArrowRight size={16} />
            </button>
          </div>
          {error && existing && (
            <button className="button secondary small" type="button" onClick={reload}>
              Discard draft and reload latest
            </button>
          )}
        </fieldset>
      </form>
    </>
  );
}
