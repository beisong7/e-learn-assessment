import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { apiRequest, ApiError } from './api';
import type { User } from './data';

type AuthContextValue = {
  user: User | null;
  welcomeTour: boolean;
  finishWelcomeTour: () => void;
  status: 'loading' | 'ready' | 'error';
  error: string;
  refreshSession: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<User>;
  signUp: (name: string, email: string, password: string) => Promise<User>;
  signOut: () => Promise<void>;
};
const Context = createContext<AuthContextValue | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthContextValue['status']>('loading');
  const [error, setError] = useState('');
  const [welcomeUserId, setWelcomeUserId] = useState<string | null>(null);
  const version = useRef(0);
  const mutationPending = useRef(false);
  const refreshSession = useCallback(async () => {
    if (mutationPending.current) return;
    const current = ++version.current;
    try {
      const result = await apiRequest<{ user: User }>('/auth/me', { notifyUnauthorized: false });
      if (current === version.current) {
        setUser(result.user);
        setStatus('ready');
        setError('');
      }
    } catch (cause) {
      if (current !== version.current) return;
      if (cause instanceof ApiError && cause.status === 401) {
        setUser(null);
        setStatus('ready');
        setError('');
      } else {
        setStatus('error');
        setError(cause instanceof Error ? cause.message : 'Session check failed.');
      }
    }
  }, []);
  useEffect(() => {
    void refreshSession();
    const expired = () => {
      ++version.current;
      setUser(null);
      setStatus('ready');
      setError('');
    };
    const visible = () => {
      if (document.visibilityState === 'visible') void refreshSession();
    };
    const timer = window.setInterval(() => {
      void refreshSession();
    }, 60000);
    window.addEventListener('learnova:session-expired', expired);
    window.addEventListener('focus', refreshSession);
    document.addEventListener('visibilitychange', visible);
    return () => {
      ++version.current;
      window.clearInterval(timer);
      window.removeEventListener('learnova:session-expired', expired);
      window.removeEventListener('focus', refreshSession);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [refreshSession]);
  async function authenticate(path: string, body: unknown) {
    mutationPending.current = true;
    ++version.current;
    try {
      const result = await apiRequest<{ user: User }>(path, {
        method: 'POST',
        body,
        notifyUnauthorized: false,
      });
      setWelcomeUserId(path === '/auth/register' ? result.user.id : null);
      setUser(result.user);
      setStatus('ready');
      setError('');
      return result.user;
    } finally {
      mutationPending.current = false;
    }
  }
  async function signOut() {
    mutationPending.current = true;
    ++version.current;
    try {
      await apiRequest<void>('/auth/logout', { method: 'POST', body: {} });
      setWelcomeUserId(null);
      setUser(null);
      setStatus('ready');
      setError('');
    } finally {
      mutationPending.current = false;
    }
  }
  return (
    <Context.Provider
      value={{
        user,
        welcomeTour: !!user && welcomeUserId === user.id,
        finishWelcomeTour: () => setWelcomeUserId(null),
        status,
        error,
        refreshSession,
        signIn: (email, password) => authenticate('/auth/login', { email, password }),
        signUp: (name, email, password) =>
          authenticate('/auth/register', { name, email, password }),
        signOut,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAuth() {
  const context = useContext(Context);
  if (!context) throw new Error('AuthProvider is required');
  return context;
}
