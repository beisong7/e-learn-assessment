import { useEffect, useState, type FormEvent } from 'react';
import { ShieldCheck, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiRequest } from './api';
import { Pagination, Progress, RequestState, SectionHeading } from './components';
import { useDemo } from './store';

interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role: 'LEARNER' | 'ADMIN';
  isActive: boolean;
  enrollmentCount: number;
}
interface LearnerDetails {
  learner: Omit<ManagedUser, 'enrollmentCount'>;
  courses: {
    id: string;
    title: string;
    progressPercent: number;
    completedLessons: number;
    totalLessons: number;
  }[];
}
function useUserList(learnersOnly: boolean) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [items, setItems] = useState<ManagedUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const timer = setTimeout(
      () => {
        const params = new URLSearchParams({ q: query.trim(), page: String(page), pageSize: '20' });
        void apiRequest<{ items: ManagedUser[]; total: number }>(
          `/admin/${learnersOnly ? 'learners' : 'users'}?${params}`,
        )
          .then((data) => {
            if (active) {
              setItems(data.items);
              setTotal(data.total);
            }
          })
          .catch((cause) => {
            if (active)
              setError(cause instanceof Error ? cause.message : 'Unable to load accounts.');
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
  }, [learnersOnly, query, page, revision]);
  return {
    items,
    total,
    loading,
    error,
    page,
    setPage,
    query,
    search: (value: string) => {
      setQuery(value);
      setPage(1);
    },
    reload: () => setRevision((value) => value + 1),
  };
}
function Status({ active }: { active: boolean }) {
  return (
    <span className={`status-badge ${active ? 'success' : ''}`}>
      {active ? 'Enabled' : 'Disabled'}
    </span>
  );
}

export function ManageLearners() {
  const list = useUserList(true);
  const { notify } = useDemo();
  const [busyId, setBusyId] = useState('');
  const [actionError, setActionError] = useState('');
  const [selected, setSelected] = useState<ManagedUser | null>(null);
  const [details, setDetails] = useState<LearnerDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [detailRetry, setDetailRetry] = useState(0);
  useEffect(() => {
    if (!selected) return;
    let active = true;
    setDetailsLoading(true);
    setDetails(null);
    setDetailsError('');
    void apiRequest<LearnerDetails>(`/admin/learners/${selected.id}/courses`)
      .then((data) => {
        if (active) setDetails(data);
      })
      .catch((cause) => {
        if (active)
          setDetailsError(
            cause instanceof Error ? cause.message : 'Unable to load enrolled courses.',
          );
      })
      .finally(() => {
        if (active) setDetailsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selected?.id, detailRetry]);
  async function toggle(user: ManagedUser) {
    setBusyId(user.id);
    setActionError('');
    try {
      await apiRequest(`/admin/learners/${user.id}/status`, {
        method: 'PATCH',
        body: { enabled: !user.isActive },
      });
      notify(`${user.name} ${user.isActive ? 'disabled' : 'enabled'}.`);
      list.reload();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Unable to change learner status.');
    } finally {
      setBusyId('');
    }
  }
  return (
    <>
      <div className="page-heading">
        <span className="overline">ADMIN WORKSPACE / LEARNERS</span>
        <h1>Manage learners</h1>
        <p>
          View enrolled courses and progress. Disabling a learner signs them out while keeping their
          learning records.
        </p>
      </div>
      <label className="search-field">
        <Users size={18} />
        <input
          aria-label="Search learners"
          placeholder="Search by name or email…"
          value={list.query}
          onChange={(event) => {
            list.search(event.target.value);
            setSelected(null);
          }}
        />
      </label>
      {actionError && (
        <p className="field-error" role="alert">
          {actionError}
        </p>
      )}
      <RequestState loading={list.loading} error={list.error} retry={list.reload} />
      {!list.loading && !list.error && (
        <section className="panel account-panel">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Learner</th>
                  <th>Status</th>
                  <th>Enrolled courses</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.name}</strong>
                      <small>{user.email}</small>
                    </td>
                    <td>
                      <Status active={user.isActive} />
                    </td>
                    <td>{user.enrollmentCount}</td>
                    <td>
                      <div className="account-actions">
                        <button
                          className="button secondary small"
                          onClick={() => setSelected(user)}
                          aria-label={`View courses for ${user.email}`}
                        >
                          View courses
                        </button>
                        <button
                          className="button secondary small"
                          disabled={!!busyId}
                          onClick={() => void toggle(user)}
                          aria-label={`${user.isActive ? 'Disable' : 'Enable'} ${user.email}`}
                        >
                          {busyId === user.id ? 'Saving…' : user.isActive ? 'Disable' : 'Enable'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!list.items.length && <p className="muted">No learners found.</p>}
          <Pagination page={list.page} pageSize={20} total={list.total} onPage={list.setPage} />
        </section>
      )}
      {selected && (
        <section className="panel account-panel" aria-label="Learner enrolled courses">
          <SectionHeading title={`${selected.name}’s courses`} description={selected.email} />
          <RequestState
            loading={detailsLoading}
            error={detailsError}
            retry={() => setDetailRetry((value) => value + 1)}
          />
          {details && !detailsLoading && !detailsError && (
            <>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Course</th>
                      <th>Completed lessons</th>
                      <th>Completion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.courses.map((course) => (
                      <tr key={course.id}>
                        <td>
                          <Link to={`/courses/${course.id}`}>
                            <strong>{course.title}</strong>
                          </Link>
                        </td>
                        <td>
                          {course.completedLessons} / {course.totalLessons}
                        </td>
                        <td>
                          <div className="table-progress">
                            <Progress value={course.progressPercent} />
                            <span>{course.progressPercent}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!details.courses.length && (
                <p className="muted">This learner has not enrolled in any courses yet.</p>
              )}
            </>
          )}
        </section>
      )}
    </>
  );
}

export function ManageUsers() {
  const list = useUserList(false);
  const { notify } = useDemo();
  const [name, setName] = useState(''),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false),
    [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiRequest('/admin/users', {
        method: 'POST',
        body: { name: name.trim(), email: email.trim(), password },
      });
      setName('');
      setEmail('');
      setPassword('');
      list.search('');
      list.setPage(1);
      list.reload();
      notify('Administrator created. They can now sign in with their email and password.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create administrator.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <span className="overline">ADMIN WORKSPACE / USERS</span>
        <h1>Manage users</h1>
        <p>Review platform accounts and add a new administrator.</p>
      </div>
      <section className="panel account-panel">
        <SectionHeading
          title="Add an administrator"
          description="This account will have access to course, learner, and user management."
        />
        <form onSubmit={submit} aria-busy={saving}>
          <fieldset className="editor-fields" disabled={saving}>
            <div className="form-grid">
              <label>
                Full name
                <input
                  required
                  minLength={2}
                  maxLength={120}
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label>
                Email address
                <input
                  type="email"
                  required
                  maxLength={320}
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <div>
                <label>
                  Password
                  <input
                    type="password"
                    required
                    minLength={8}
                    maxLength={128}
                    autoComplete="new-password"
                    aria-describedby="new-admin-password-help"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </label>
                <span id="new-admin-password-help" className="muted">
                  At least 8 characters.
                </span>
              </div>
            </div>
            {error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
            <button className="button primary account-submit" type="submit">
              <ShieldCheck size={17} />
              {saving ? 'Creating…' : 'Create administrator'}
            </button>
          </fieldset>
        </form>
      </section>
      <label className="search-field">
        <Users size={18} />
        <input
          aria-label="Search users"
          placeholder="Search by name or email…"
          value={list.query}
          onChange={(event) => list.search(event.target.value)}
        />
      </label>
      <RequestState loading={list.loading} error={list.error} retry={list.reload} />
      {!list.loading && !list.error && (
        <section className="panel account-panel">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.name}</strong>
                      <small>{user.email}</small>
                    </td>
                    <td>{user.role === 'ADMIN' ? 'Administrator' : 'Learner'}</td>
                    <td>
                      <Status active={user.isActive} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!list.items.length && <p className="muted">No users found.</p>}
          <Pagination page={list.page} pageSize={20} total={list.total} onPage={list.setPage} />
        </section>
      )}
    </>
  );
}
