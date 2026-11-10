import { WelcomeTour } from './WelcomeTour';
import {
  ArrowDownRight,
  ArrowRight,
  BookOpen,
  Check,
  Clock3,
  GraduationCap,
  LayoutDashboard,
  Library,
  Users,
  UserCog,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useDemo } from './store';
import { useAuth } from './auth-context';
import { lessonCount, courseDuration, formatDuration, type Course } from './data';

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link className={`logo ${light ? 'light' : ''}`} to="/" aria-label="Learnova home">
      <span className="logo-symbol">
        <GraduationCap size={22} />
      </span>
      learn<span>ova.</span>
    </Link>
  );
}
export function PublicHeader() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <header className="public-header">
      <div className="container public-nav">
        <Logo />
        <button
          className="icon-button mobile-toggle"
          aria-label="Toggle navigation"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <X /> : <Menu />}
        </button>
        <nav className={open ? 'public-links open' : 'public-links'} aria-label="Main navigation">
          <Link to="/courses" onClick={() => setOpen(false)}>
            Explore courses
          </Link>
          <a href="/#how-it-works" onClick={() => setOpen(false)}>
            How it works
          </a>
          <a href="/#why-learnova" onClick={() => setOpen(false)}>
            Why Learnova
          </a>
        </nav>
        <div className="public-actions">
          <Link
            className="text-link"
            to={user ? (user.role === 'admin' ? '/admin' : '/dashboard') : '/login'}
          >
            {user ? 'My workspace' : 'Log in'}
          </Link>
          <Link className="button primary small" to="/register">
            Start learning <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </header>
  );
}
export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-top">
        <div>
          <Logo />
          <p>
            A little learning.
            <br />A lot of possibility.
          </p>
        </div>
        <div>
          <span className="overline">YOUR NEXT CHAPTER</span>
          <Link to="/courses">
            Explore courses <ArrowUp />
          </Link>
          <Link to="/register">
            Create your learning space <ArrowUp />
          </Link>
        </div>
        <div>
          <span className="overline">TAKE A LOOK AROUND</span>
          <Link to="/dashboard">
            Learner workspace <ArrowUp />
          </Link>
          <Link to="/admin">
            Admin workspace <ArrowUp />
          </Link>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} Learnova · An LMS assessment project.</span>
        <span>
          Made for curious minds. <Sparkles size={14} />
        </span>
      </div>
    </footer>
  );
}
function ArrowUp() {
  return <ArrowDownRight size={15} />;
}
export function Progress({ value }: { value: number }) {
  return (
    <div
      className="track"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Course completion"
    >
      <span style={{ width: `${value}%` }} />
    </div>
  );
}
export function CourseCard({ course }: { course: Course }) {
  const { percent, isEnrolled } = useDemo();
  const value = percent(course);
  return (
    <Link to={`/courses/${course.id}`} className="course-card">
      <div className="course-image">
        <img src={course.thumbnailUrl} alt="" loading="lazy" />
        <span className="category-pill">{course.category}</span>
        <span className="card-arrow">
          <ArrowRight size={18} />
        </span>
      </div>
      <div className="course-body">
        <span className="course-level">{course.level}</span>
        <h3>{course.title}</h3>
        <p>{course.description}</p>
        <div className="course-meta">
          <span>
            <Clock3 size={14} /> {formatDuration(courseDuration(course))}
          </span>
          <span>
            <BookOpen size={14} /> {lessonCount(course)} lessons
          </span>
        </div>
        {isEnrolled(course.id) ? (
          <div className="card-progress">
            <div>
              <span>Your progress</span>
              <strong>{value}%</strong>
            </div>
            <Progress value={value} />
          </div>
        ) : (
          <div className="card-bottom">
            <span>By {course.instructor}</span>
            <strong>
              Explore course <ArrowRight size={13} />
            </strong>
          </div>
        )}
      </div>
    </Link>
  );
}
export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: { label: string; to: string };
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <span className="overline">{eyebrow}</span>}
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action && (
        <Link className="text-link arrow-link" to={action.to}>
          {action.label}
          <ArrowRight size={17} />
        </Link>
      )}
    </div>
  );
}
export function EmptyState({
  title,
  description,
  to,
  label,
}: {
  title: string;
  description: string;
  to?: string;
  label?: string;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <BookOpen size={29} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {to && (
        <Link to={to} className="button primary">
          {label} <ArrowRight size={16} />
        </Link>
      )}
    </div>
  );
}
export function DemoBanner() {
  const { user } = useAuth();
  return (
    <div className="demo-banner">
      <span className="demo-dot" />
      Learning workspace{' '}
      <span className="banner-extra">· Your progress is saved to your account</span>
      <Link to={user ? (user.role === 'admin' ? '/admin' : '/dashboard') : '/login'}>
        {user ? 'My workspace' : 'Sign in'} <ArrowRight size={12} />
      </Link>
    </div>
  );
}
export function AppLayout({ admin = false }: { admin?: boolean }) {
  const { state, notify } = useDemo();
  const { signOut, welcomeTour, finishWelcomeTour } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const nav = admin
    ? [
        { to: '/admin', label: 'Overview', icon: LayoutDashboard },
        { to: '/admin/courses', label: 'Manage courses', icon: Library },
        { to: '/admin/learners', label: 'Manage learners', icon: Users },
        { to: '/admin/users', label: 'Manage users', icon: UserCog },
      ]
    : [
        { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/courses', label: 'Explore courses', icon: Search },
        { to: '/my-learning', label: 'My learning', icon: Library },
      ];
  return (
    <div className="workspace">
      <a className="skip-link" href="#workspace-content">
        Skip to content
      </a>
      {menuOpen && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside className={`sidebar ${menuOpen ? 'visible' : ''}`}>
        <Logo />
        <span className="nav-label">{admin ? 'ADMIN WORKSPACE' : 'YOUR WORKSPACE'}</span>
        <nav aria-label="Workspace navigation">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              data-tour={item.to}
              to={item.to}
              end={item.to === '/admin'}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setMenuOpen(false)}
            >
              <item.icon size={19} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <span className="nav-label secondary">DISCOVER</span>
        <Link className="nav-item" to="/">
          <GraduationCap size={19} />
          Learnova home
        </Link>
        {state.user?.role === 'admin' && (
          <Link className="nav-item" to={admin ? '/dashboard' : '/admin'}>
            <ShieldCheck size={19} />
            {admin ? 'Learner workspace' : 'Admin workspace'}
          </Link>
        )}
        {!state.user && (
          <Link className="nav-item" to="/login">
            <LogOut size={19} />
            Sign in
          </Link>
        )}
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <Sparkles size={20} />
            <strong>Small steps. Big possibilities.</strong>
            <p>Your next chapter starts with a little curiosity.</p>
            <Link to={admin ? '/admin/courses' : '/courses'} className="button lime small">
              {admin ? 'Manage content' : 'Find your next skill'} <ArrowRight size={14} />
            </Link>
          </div>
          {state.user && (
            <button
              className="nav-item"
              disabled={signingOut}
              onClick={async () => {
                setSigningOut(true);
                try {
                  await signOut();
                  navigate('/');
                } catch (cause) {
                  notify(
                    cause instanceof Error ? cause.message : 'Unable to log out. Please try again.',
                  );
                } finally {
                  setSigningOut(false);
                }
              }}
            >
              <LogOut size={17} />
              {signingOut ? 'Signing out…' : 'Log out'}
            </button>
          )}
        </div>
      </aside>
      <div className="workspace-main">
        <DemoBanner />
        <header className="workspace-topbar">
          <button
            className="icon-button mobile-toggle"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-expanded={menuOpen}
            aria-label="Toggle workspace navigation"
          >
            <Menu />
          </button>
          <div className="profile">
            <span className="profile-type">
              {admin ? 'Admin workspace' : 'Your learning space'}
            </span>
            <span className="avatar">
              {(state.user?.name || 'Guest')
                .split(' ')
                .map((n) => n[0])
                .slice(0, 2)
                .join('')}
            </span>
            <div>
              <strong>{state.user?.name || 'Guest'}</strong>
              <small>
                {state.user
                  ? state.user.role === 'admin'
                    ? 'Administrator'
                    : 'Learner'
                  : 'Browse courses'}
              </small>
            </div>
          </div>
        </header>
        <main id="workspace-content" className="workspace-content" key={location.pathname}>
          <Outlet />
        </main>
      </div>
      {!admin && welcomeTour && location.pathname === '/dashboard' && (
        <WelcomeTour onFinish={finishWelcomeTour} />
      )}
    </div>
  );
}
export function CheckItem({ children }: { children: React.ReactNode }) {
  return (
    <div className="check-item">
      <span>
        <Check size={15} />
      </span>
      {children}
    </div>
  );
}

export function RequestState({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: string;
  retry: () => void;
}) {
  if (loading)
    return (
      <div className="request-state" role="status">
        Loading courses…
      </div>
    );
  if (error)
    return (
      <div className="request-state">
        <p role="alert">{error}</p>
        <button className="button secondary" onClick={retry}>
          Try again
        </button>
      </div>
    );
  return null;
}
export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Course pages">
      <button
        className="button secondary small"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        Previous
      </button>
      <span>
        Page {page} of {pages}
      </span>
      <button
        className="button secondary small"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
      >
        Next
      </button>
    </nav>
  );
}
