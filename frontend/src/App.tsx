import { ManageLearners, ManageUsers } from './UserManagement';
import { useEffect } from 'react';
import { Route, Routes, useLocation, Navigate, Outlet } from 'react-router-dom';
import { X } from 'lucide-react';
import Landing from './Landing';
import Auth from './Auth';
import { AppLayout, EmptyState } from './components';
import { Catalog, CourseDetails, Dashboard, Player } from './Learning';
import { AdminDashboard, CourseEditor, ManageCourses } from './Admin';
import { useDemo } from './store';
import { useAuth } from './auth-context';

function ProtectedRoute({ admin = false }: { admin?: boolean }) {
  const { user, status, error, refreshSession } = useAuth();
  if (status === 'loading')
    return (
      <div className="session-state" role="status">
        Loading your learning space…
      </div>
    );
  if (status === 'error')
    return (
      <div className="session-state">
        <p role="alert">{error}</p>
        <button className="button primary" onClick={() => void refreshSession()}>
          Try again
        </button>
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  if (admin && user.role !== 'admin')
    return (
      <div className="not-found">
        <EmptyState
          title="Administrator access required"
          description="Your account has learner access. Head back to your learning space."
          to="/dashboard"
          label="My learning space"
        />
      </div>
    );
  return <Outlet />;
}
function AuthPage({ register = false }: { register?: boolean }) {
  const { user, status } = useAuth();
  if (status === 'loading')
    return (
      <div className="session-state" role="status">
        Checking your session…
      </div>
    );
  if (user && status === 'ready')
    return <Navigate to={user.role === 'admin' ? '/admin' : '/dashboard'} replace />;
  return <Auth register={register} />;
}
function ScrollAndTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    const label =
      pathname === '/'
        ? 'A little learning. A lot of possibility.'
        : pathname.startsWith('/admin')
          ? 'Admin workspace'
          : pathname.startsWith('/learn/')
            ? 'Your next lesson'
            : pathname === '/login'
              ? 'Welcome back'
              : pathname === '/register'
                ? 'Your next chapter'
                : pathname === '/dashboard'
                  ? 'Your learning space'
                  : pathname === '/my-learning'
                    ? 'My learning'
                    : 'Explore your possibilities';
    document.title = `Learnova — ${label}`;
  }, [pathname]);
  return null;
}
export default function App() {
  const { notice, dismissNotice } = useDemo();
  return (
    <>
      <ScrollAndTitle />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<AuthPage />} />
        <Route path="/register" element={<AuthPage register />} />
        <Route element={<AppLayout />}>
          <Route path="/courses" element={<Catalog />} />
          <Route path="/courses/:courseId" element={<CourseDetails />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/my-learning" element={<Dashboard learningOnly />} />
            <Route path="/learn/:courseId/:lessonId" element={<Player />} />
          </Route>
        </Route>
        <Route element={<ProtectedRoute admin />}>
          <Route element={<AppLayout admin />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/learners" element={<ManageLearners />} />
            <Route path="/admin/users" element={<ManageUsers />} />
            <Route path="/admin/courses" element={<ManageCourses />} />
            <Route path="/admin/courses/new" element={<CourseEditor />} />
            <Route path="/admin/courses/:courseId/edit" element={<CourseEditor />} />
          </Route>
        </Route>
        <Route
          path="*"
          element={
            <div className="not-found">
              <EmptyState
                title="A little off the learning path."
                description="This page doesn’t exist. Let’s find your next possibility."
                to="/"
                label="Back to Learnova"
              />
            </div>
          }
        />
      </Routes>
      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button className="icon-button" onClick={dismissNotice} aria-label="Dismiss notification">
            <X size={17} />
          </button>
        </div>
      )}
    </>
  );
}
