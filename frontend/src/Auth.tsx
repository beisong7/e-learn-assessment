import { ArrowLeft, ArrowRight, GraduationCap, ShieldCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useState, type FormEvent } from 'react';
import { Logo } from './components';
import { useAuth } from './auth-context';

export default function Auth({ register = false }: { register?: boolean }) {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (register && name.trim().length < 2) {
      setError('Please enter your name.');
      return;
    }
    if (password.length < (register ? 8 : 1)) {
      setError('Please enter a valid password.');
      return;
    }
    setSubmitting(true);
    try {
      const user = register
        ? await signUp(name.trim(), email.trim(), password)
        : await signIn(email.trim(), password);
      navigate(user.role === 'admin' ? '/admin' : '/dashboard', { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <div className="auth-layout">
      <aside className="auth-art">
        <Logo light />
        <div>
          <span className="tag">A LITTLE LEARNING. A LOT OF POSSIBILITY.</span>
          <h2>
            Make room
            <br />
            for what’s
            <br />
            <span>next.</span>
          </h2>
          <p>
            Follow a spark of curiosity.
            <br />
            See where it takes you.
          </p>
        </div>
        <span className="auth-spark" aria-hidden="true">
          ✳
        </span>
        <small>YOUR PACE. YOUR POSSIBILITIES.</small>
      </aside>
      <main className="auth-main">
        <Link to="/" className="back-link">
          <ArrowLeft size={15} /> Back to Learnova
        </Link>
        <div className="auth-form-wrap">
          <span className="auth-icon">
            <GraduationCap size={26} />
          </span>
          <span className="overline">YOUR NEXT CHAPTER</span>
          <h1>{register ? 'Good things start here.' : 'A little more possibility.'}</h1>
          <p>
            {register
              ? 'Create a space for your curiosity.'
              : 'Welcome back. Pick up where you left off.'}
          </p>
          <div className="auth-demo-note">
            <ShieldCheck size={17} />
            <span>
              Sign in securely to your learning space. Your account determines your learner or
              administrator access.
            </span>
          </div>
          <form onSubmit={submit} aria-busy={submitting}>
            {register && (
              <label>
                Your name
                <input
                  autoComplete="name"
                  required
                  minLength={2}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jordan Davis"
                />
              </label>
            )}
            <label>
              Email address
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete={register ? 'new-password' : 'current-password'}
                required
                minLength={register ? 8 : 1}
                maxLength={register ? 128 : 1024}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
            </label>
            {error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
            <button className="button primary full" type="submit" disabled={submitting}>
              {submitting
                ? register
                  ? 'Creating your account…'
                  : 'Signing in…'
                : register
                  ? 'Create account'
                  : 'Log in'}
              <ArrowRight size={17} />
            </button>
          </form>
          <p className="auth-switch">
            {register ? 'Already exploring?' : 'New around here?'}{' '}
            <Link to={register ? '/login' : '/register'}>
              {register ? 'Log in' : 'Start your next chapter'}
            </Link>
          </p>
          <p className="sample-note">
            New accounts join as learners. Administrator access is assigned by the platform.
          </p>
        </div>
      </main>
    </div>
  );
}
