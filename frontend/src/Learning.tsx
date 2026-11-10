import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Clock3,
  GraduationCap,
  Play,
  Search,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { categories, courseDuration, formatDuration, formatTime, type Course } from './data';
import {
  CheckItem,
  CourseCard,
  EmptyState,
  Pagination,
  Progress,
  RequestState,
  SectionHeading,
} from './components';
import { useCourse, useCourseList } from './content-hooks';
import { apiRequest } from './api';
import type { Lesson } from './data';
import { useDemo } from './store';

export function Catalog() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') || '';
  const category = params.get('category') || 'All courses';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const result = useCourseList(query, category, page);
  const filtered = result.items;
  function filter(key: string, value: string) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (key !== 'page') next.delete('page');
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  }
  return (
    <>
      <div className="page-heading">
        <span className="overline">A WORLD OF POSSIBILITIES</span>
        <h1>Follow your curiosity.</h1>
        <p>Your next skill is waiting. Find a course that feels like you.</p>
      </div>
      <div className="catalog-banner">
        <div>
          <span className="tag">YOUR NEXT CHAPTER</span>
          <h2>
            Start somewhere.
            <br />
            Go somewhere new.
          </h2>
          <p>Small lessons. Fresh perspectives. Room to grow.</p>
        </div>
        <CompassArt />
      </div>
      <div className="catalog-toolbar">
        <label className="search-field">
          <Search size={18} />
          <input
            aria-label="Search catalog"
            placeholder="Search courses or topics…"
            value={query}
            onChange={(e) => filter('q', e.target.value)}
          />
        </label>
        <span>{result.total} courses to explore</span>
      </div>
      <div className="tabs">
        {['All courses', ...categories].map((c) => (
          <button
            key={c}
            className={category === c ? 'active' : ''}
            onClick={() => filter('category', c)}
          >
            {c}
          </button>
        ))}
      </div>
      <RequestState loading={result.loading} error={result.error} retry={result.reload} />
      {!result.loading &&
        !result.error &&
        (filtered.length ? (
          <div className="course-grid">
            {filtered.map((c) => (
              <CourseCard key={c.id} course={c} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No courses found"
            description="Try another topic or clear your search to discover something new."
          />
        ))}
      <Pagination
        page={page}
        pageSize={result.pageSize}
        total={result.total}
        onPage={(value) => filter('page', String(value))}
      />
      <p className="sample-note">
        Sample library · Short sample clips are used to test playback and completion.
      </p>
    </>
  );
}
function CompassArt() {
  return (
    <div className="compass-art" aria-hidden="true">
      <div />
      <span>✳</span>
      <Sparkles />
    </div>
  );
}
function nextLesson(course: Course, progress: ReturnType<typeof useDemo>['state']['progress']) {
  return course.lessons.find((l) => !progress[l.id]?.completed) || course.lessons[0];
}
export function Dashboard({ learningOnly = false }: { learningOnly?: boolean }) {
  const { state, stats, percent, isEnrolled, loading, error, reload } = useDemo();
  if (loading || error) return <RequestState loading={loading} error={error} retry={reload} />;
  const enrolled = state.courses.filter((c) => isEnrolled(c.id));
  const active = enrolled.filter((c) => percent(c) < 100);
  const continueCourse = active[0] || enrolled[0];
  const lesson = continueCourse && nextLesson(continueCourse, state.progress);
  return (
    <>
      <div className="page-heading">
        <span className="overline">
          YOUR LEARNING SPACE / {learningOnly ? 'MY LEARNING' : 'OVERVIEW'}
        </span>
        <h1>
          {learningOnly
            ? 'A little further, every day.'
            : `Hello, ${state.user?.name.split(' ')[0] || 'Jordan'}. Let’s grow.`}
        </h1>
        <p>
          {learningOnly
            ? 'Your courses, your progress, your next chapter.'
            : 'A fresh day, a fresh possibility. Make a little time for you.'}
        </p>
      </div>
      {!learningOnly && (
        <div className="stats-grid">
          {[
            {
              label: 'Enrolled courses',
              value: stats.enrolled.toString().padStart(2, '0'),
              icon: BookOpen,
              note: 'Your personal learning library',
            },
            {
              label: 'In progress',
              value: stats.active.toString().padStart(2, '0'),
              icon: TrendingUp,
              note: 'One step closer to your next skill',
            },
            {
              label: 'Completed courses',
              value: stats.completed.toString().padStart(2, '0'),
              icon: CheckCircle2,
              note: 'Small wins worth celebrating',
            },
            {
              label: 'Saved playback',
              value: formatDuration(stats.savedSeconds),
              icon: Clock3,
              note: 'Saved positions across your lessons',
            },
          ].map((s) => (
            <div className="stat" key={s.label}>
              <div>
                <span>{s.label}</span>
                <s.icon size={19} />
              </div>
              <strong>{s.value}</strong>
              <small>{s.note}</small>
            </div>
          ))}
        </div>
      )}
      {continueCourse && lesson && !learningOnly && (
        <section className="continue-feature">
          <div>
            <span className="tag">
              <Sparkles size={13} /> PICK UP WHERE YOU LEFT OFF
            </span>
            <h2>{continueCourse.title}</h2>
            <p>{continueCourse.description}</p>
            <div className="progress-caption">
              <span>Course progress</span>
              <strong>{percent(continueCourse)}% complete</strong>
            </div>
            <Progress value={percent(continueCourse)} />
            <Link className="button lime small" to={`/learn/${continueCourse.id}/${lesson.id}`}>
              <Play size={14} />
              {percent(continueCourse) === 100 ? 'Revisit Course' : 'Continue learning'}
            </Link>
          </div>
          <img src={continueCourse.thumbnailUrl} alt="" />
        </section>
      )}
      <SectionHeading
        title={learningOnly ? 'Your course library' : 'Keep your curiosity going'}
        action={{ label: 'Explore courses', to: '/courses' }}
      />
      {enrolled.length ? (
        <div className="course-grid">
          {enrolled.map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="Your next chapter starts here."
          description="Find a course that sparks your curiosity. Once you enroll, your progress will feel right at home here."
          to="/courses"
          label="Explore courses"
        />
      )}
      {!!enrolled.length && !learningOnly && (
        <div className="dashboard-bottom">
          <section className="panel">
            <SectionHeading title="Your next little step" />
            {active.slice(0, 3).map((c) => {
              const next = nextLesson(c, state.progress);
              return (
                next && (
                  <Link className="lesson-row" to={`/learn/${c.id}/${next.id}`} key={c.id}>
                    <span className="lesson-number">
                      <Play size={15} />
                    </span>
                    <span>
                      <strong>{next.title}</strong>
                      <small>
                        {c.title} · {formatDuration(next.durationSeconds)}
                      </small>
                    </span>
                    <ArrowRight size={17} />
                  </Link>
                )
              );
            })}
            {!active.length && (
              <p className="muted">You’ve completed your courses. Explore something new!</p>
            )}
          </section>
          <section className="panel learning-note">
            <Sparkles size={28} />
            <h3>Every little bit counts.</h3>
            <p>Learning isn’t a race. Come back when you’re ready, and we’ll keep your place.</p>
            <Link className="text-link arrow-link" to="/courses">
              Find a fresh perspective <ArrowRight size={16} />
            </Link>
          </section>
        </div>
      )}
    </>
  );
}
export function CourseDetails() {
  const navigate = useNavigate();
  const { courseId } = useParams();
  const { state, percent, isEnrolled, enroll, notify, loading, error, reload } = useDemo();
  const result = useCourse(courseId);
  const course = result.course;
  const [enrolling, setEnrolling] = useState(false);
  const [enrollError, setEnrollError] = useState('');
  if (loading || error || result.loading || result.error)
    return (
      <RequestState
        loading={loading || result.loading}
        error={result.error || error}
        retry={() => {
          reload();
          result.reload();
        }}
      />
    );
  if (!course)
    return (
      <EmptyState
        title="Course not found"
        description="This course may have been removed. Let’s find another possibility."
        to="/courses"
        label="Explore courses"
      />
    );
  const enrolled = isEnrolled(course.id);
  const next = nextLesson(course, state.progress);
  return (
    <>
      <Link className="back-link" to="/courses">
        <ArrowLeft size={15} /> Back to courses
      </Link>
      <div className="detail-layout">
        <div>
          <div className="detail-hero">
            <img src={course.thumbnailUrl} alt="" />
            <span className="category-pill">{course.category}</span>
          </div>
          <div className="page-heading">
            <span className="overline">
              {course.category} / {course.level}
            </span>
            <h1>{course.title}</h1>
            <p>{course.description}</p>
          </div>
          <div className="instructor-line">
            <span className="avatar">
              {course.instructor
                .split(' ')
                .map((n) => n[0])
                .join('')}
            </span>
            <div>
              <small>YOUR COURSE GUIDE</small>
              <strong>{course.instructor}</strong>
            </div>
            <span className="muted">Illustrative instructor</span>
          </div>
          <section className="panel outcomes">
            <h2>A few things you’ll take away</h2>
            {course.outcomes.map((o) => (
              <CheckItem key={o}>{o}</CheckItem>
            ))}
          </section>
          <section className="curriculum">
            <SectionHeading
              title="One lesson at a time"
              description={`${course.lessons.length} lessons · ${formatDuration(courseDuration(course))} of sample video`}
            />
            {course.lessons.map((l, i) => {
              const done = state.progress[l.id]?.completed;
              return (
                <Link
                  key={l.id}
                  className={`lesson-row ${done ? 'is-complete' : ''}`}
                  to={enrolled ? `/learn/${course.id}/${l.id}` : '#enroll'}
                  onClick={(e) => {
                    if (!enrolled) {
                      e.preventDefault();
                      document.getElementById('enroll')?.scrollIntoView({ behavior: 'smooth' });
                      notify('Enroll in this course to start the lessons.');
                    }
                  }}
                >
                  <span className="lesson-number">
                    {done ? <Check size={17} /> : String(i + 1).padStart(2, '0')}
                  </span>
                  <span>
                    <strong>{l.title}</strong>
                    <small>
                      {done ? 'Completed' : 'Video lesson'} · {formatDuration(l.durationSeconds)}
                    </small>
                  </span>
                  <Play size={15} />
                </Link>
              );
            })}
            {!course.lessons.length && (
              <p className="muted">Lessons are being prepared. Check back soon.</p>
            )}
          </section>
        </div>
        <aside className="enroll-panel panel" id="enroll">
          <span className="overline">MAKE ROOM FOR SOMETHING NEW</span>
          <h2>
            Your next skill
            <br />
            starts here.
          </h2>
          <p>
            Practical lessons. Your own pace.
            <br />A place to keep growing.
          </p>
          <div className="enroll-facts">
            <span>
              <BookOpen size={17} />
              {course.lessons.length} focused lessons
            </span>
            <span>
              <Clock3 size={17} />
              {formatDuration(courseDuration(course))} sample content
            </span>
            <span>
              <GraduationCap size={17} />
              {course.level}
            </span>
            <span>
              <CheckCircle2 size={17} />
              Track your learning progress
            </span>
          </div>
          {enrolled ? (
            <>
              <div className="progress-caption">
                <span>Your progress</span>
                <strong>{percent(course)}%</strong>
              </div>
              <Progress value={percent(course)} />
              {next && (
                <Link className="button lime full" to={`/learn/${course.id}/${next.id}`}>
                  {percent(course) === 100 ? 'Revisit course' : 'Continue learning'}
                  <ArrowRight size={16} />
                </Link>
              )}
            </>
          ) : (
            <button
              disabled={!course.lessons.length || enrolling}
              className="button lime full"
              onClick={async () => {
                if (!state.user) {
                  navigate('/login');
                  return;
                }
                setEnrolling(true);
                setEnrollError('');
                try {
                  await enroll(course.id);
                  notify('You’re enrolled! Your next chapter is ready.');
                } catch (cause) {
                  setEnrollError(
                    cause instanceof Error ? cause.message : 'Unable to enroll. Try again.',
                  );
                } finally {
                  setEnrolling(false);
                }
              }}
            >
              {enrolling ? 'Enrolling…' : 'Enroll in this course'}
              <ArrowRight size={16} />
            </button>
          )}
          {enrollError && (
            <p className="field-error" role="alert">
              {enrollError}
            </p>
          )}
          <small className="enroll-note">Free sample courses · No payment needed</small>
          <p className="sample-note">
            All lessons use a short sample nature clip to demonstrate playback, resume, and
            completion.
          </p>
        </aside>
      </div>
    </>
  );
}
export function Player() {
  const { courseId, lessonId } = useParams();
  const {
    state,
    isEnrolled,
    percent,
    saveProgress,
    hydrateProgress,
    saveStatus,
    saveError,
    retryProgress,
    loading,
    error,
    reload,
  } = useDemo();
  const result = useCourse(courseId);
  const [videoLesson, setVideoLesson] = useState<Lesson | null>(null);
  const [sourceError, setSourceError] = useState('');
  const [sourceRetry, setSourceRetry] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  const lastSave = useRef(0);
  const [videoError, setVideoError] = useState(false);
  const [playing, setPlaying] = useState(false);
  const course = result.course;
  const lesson = course?.lessons.find((l) => l.id === lessonId);
  const enrolled = !!courseId && isEnrolled(courseId);
  useEffect(() => {
    if (!lessonId || !enrolled) return;
    let active = true;
    setVideoLesson(null);
    setSourceError('');
    void apiRequest<{ lesson: Lesson; progress: import('./data').LessonProgress | null }>(
      `/lessons/${lessonId}`,
    )
      .then((data) => {
        if (active) {
          initialPosition.current = data.progress?.positionSeconds || 0;
          hydrateProgress(lessonId, data.progress);
          setVideoLesson(data.lesson);
        }
      })
      .catch((cause) => {
        if (active)
          setSourceError(cause instanceof Error ? cause.message : 'Unable to load the video.');
      });
    return () => {
      active = false;
    };
  }, [lessonId, enrolled, sourceRetry]);
  const initialPosition = useRef(state.progress[lessonId || '']?.positionSeconds || 0);
  useEffect(() => {
    initialPosition.current = state.progress[lessonId || '']?.positionSeconds || 0;
    setVideoError(false);
    setPlaying(false);
    lastSave.current = 0;
  }, [lessonId]); // Restore only on lesson changes, not periodic saves.
  useEffect(() => {
    const player = video.current;
    const flush = () => {
      if (player && lessonId && Number.isFinite(player.currentTime) && player.currentTime > 0)
        saveProgress(lessonId, player.currentTime, player.ended);
    };
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', flush);
    return () => {
      flush();
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', flush);
    };
  }, [lessonId, videoLesson?.id, loading, result.loading]);
  if (loading || error || result.loading || result.error)
    return (
      <RequestState
        loading={loading || result.loading}
        error={result.error || error}
        retry={() => {
          reload();
          result.reload();
        }}
      />
    );
  if (!course || !lesson)
    return (
      <EmptyState
        title="Lesson not found"
        description="This lesson may have moved or been removed."
        to="/courses"
        label="Explore courses"
      />
    );
  if (!isEnrolled(course.id))
    return (
      <EmptyState
        title="Make this course yours first."
        description="Enroll to start watching and save your progress."
        to={`/courses/${course.id}`}
        label="View course"
      />
    );
  if (sourceError || !videoLesson)
    return (
      <RequestState
        loading={!sourceError}
        error={sourceError}
        retry={() => setSourceRetry((value) => value + 1)}
      />
    );
  const index = course.lessons.indexOf(lesson);
  const next = course.lessons[index + 1];
  const completed = state.progress[lesson.id]?.completed;
  const saved = state.progress[lesson.id];
  return (
    <>
      <Link className="back-link" to={`/courses/${course.id}`}>
        <ArrowLeft size={15} />
        {course.title}
      </Link>
      <div className="player-layout">
        <div>
          <section className="video-card">
            <div className="video-wrap">
              <video
                key={lesson.id}
                ref={video}
                controls
                playsInline
                preload="metadata"
                src={videoLesson.videoUrl}
                onLoadedMetadata={() => {
                  const player = video.current;
                  if (player)
                    player.currentTime =
                      initialPosition.current >= player.duration - 0.2
                        ? 0
                        : Math.min(initialPosition.current, player.duration);
                }}
                onPlay={() => setPlaying(true)}
                onPause={() => {
                  setPlaying(false);
                  if (video.current) saveProgress(lesson.id, video.current.currentTime);
                }}
                onTimeUpdate={() => {
                  const player = video.current;
                  if (player && Math.abs(player.currentTime - lastSave.current) >= 5) {
                    lastSave.current = player.currentTime;
                    saveProgress(lesson.id, player.currentTime);
                  }
                }}
                onSeeked={() => {
                  if (video.current) saveProgress(lesson.id, video.current.currentTime);
                }}
                onEnded={() => {
                  setPlaying(false);
                  saveProgress(lesson.id, video.current?.duration || lesson.durationSeconds, true);
                }}
                onError={() => setVideoError(true)}
                aria-label={lesson.title}
              />
              {videoError && (
                <div className="video-error">
                  <h3>We couldn’t load this video.</h3>
                  <p>Check your connection or try the sample again.</p>
                  <button
                    className="button lime small"
                    onClick={() => {
                      setVideoError(false);
                      video.current?.load();
                    }}
                  >
                    Retry video
                  </button>
                </div>
              )}
            </div>
            <div className="player-info">
              <div className="player-status">
                <span className="overline">
                  LESSON {String(index + 1).padStart(2, '0')} OF {course.lessons.length}
                </span>
                <span className={`status-badge ${completed ? 'success' : ''}`}>
                  {completed ? (
                    <>
                      <Check size={13} />
                      Completed
                    </>
                  ) : playing ? (
                    'Now playing'
                  ) : (
                    'Ready when you are'
                  )}
                </span>
              </div>
              <h1>{lesson.title}</h1>
              <p>{course.description}</p>
              <div className="player-save">
                <span className="demo-dot" />
                {saveStatus === 'saving'
                  ? 'Saving progress…'
                  : saved
                    ? `Saved at ${formatTime(saved.positionSeconds)}`
                    : 'Your place is saved as you watch.'}
                <span>Sample video · {formatDuration(lesson.durationSeconds)}</span>
              </div>
              {saveStatus === 'error' && (
                <div className="field-error" role="alert">
                  {saveError}
                  <button className="button secondary small" onClick={retryProgress}>
                    Retry saved progress
                  </button>
                </div>
              )}
            </div>
          </section>
          <div className="lesson-navigation">
            {index > 0 ? (
              <Link
                className="button secondary small"
                to={`/learn/${course.id}/${course.lessons[index - 1].id}`}
              >
                <ArrowLeft size={15} />
                Previous lesson
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link className="button primary small" to={`/learn/${course.id}/${next.id}`}>
                Next lesson
                <ArrowRight size={15} />
              </Link>
            ) : (
              <Link className="button primary small" to="/dashboard">
                Back to my progress
                <ArrowRight size={15} />
              </Link>
            )}
          </div>
          <section className="panel lesson-about">
            <span className="overline">ABOUT THESE LESSONS</span>
            <h3>Focus on the experience.</h3>
            <p>
              These courses use a short sample clip. Watch to the end to complete a lesson. Your
              place and completed lessons are saved to your account when you return.
            </p>
          </section>
        </div>
        <aside className="panel playlist">
          <div className="playlist-header">
            <span className="overline">YOUR LEARNING PATH</span>
            <h2>{course.title}</h2>
            <div className="progress-caption">
              <span>
                {course.lessons.filter((l) => state.progress[l.id]?.completed).length} of{' '}
                {course.lessons.length} completed
              </span>
              <strong>{percent(course)}%</strong>
            </div>
            <Progress value={percent(course)} />
          </div>
          {course.lessons.map((l, i) => (
            <Link
              className={`playlist-item ${l.id === lesson.id ? 'active' : ''}`}
              to={`/learn/${course.id}/${l.id}`}
              key={l.id}
            >
              <span className="lesson-number">
                {state.progress[l.id]?.completed ? (
                  <Check size={16} />
                ) : l.id === lesson.id ? (
                  <Play size={14} />
                ) : (
                  String(i + 1).padStart(2, '0')
                )}
              </span>
              <span>
                <strong>{l.title}</strong>
                <small>
                  {formatDuration(l.durationSeconds)} ·{' '}
                  {state.progress[l.id]?.completed
                    ? 'Completed'
                    : l.id === lesson.id
                      ? 'Current lesson'
                      : 'Video lesson'}
                </small>
              </span>
            </Link>
          ))}
        </aside>
      </div>
    </>
  );
}
