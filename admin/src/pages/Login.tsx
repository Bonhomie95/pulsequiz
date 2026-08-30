import { useState } from 'react';
import { adminApi } from '../api/client';
import { useAdminStore } from '../store/adminStore';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const setAdmin = useAdminStore((s) => s.setAdmin);
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting || !email.trim() || !password) return;
    setSubmitting(true);
    setError(null);
    try {
      // The server sets the httpOnly auth cookie; the body only carries the
      // admin profile for the UI.
      const res = await adminApi.post('/admin/login', { email, password });
      setAdmin(res.data.admin);
      nav('/', { replace: true });
    } catch (e: any) {
      // Without this the promise rejected unhandled and the button simply did
      // nothing — a wrong password looked identical to a broken page.
      const status = e?.response?.status;
      setError(
        status === 401
          ? 'Incorrect email or password.'
          : status === 429
            ? 'Too many attempts. Try again shortly.'
            : e?.response?.data?.message ?? 'Could not sign in. Check your connection.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="bg-gray-900 p-6 rounded-xl w-80">
        <h1 className="text-xl font-bold mb-4">Admin Login</h1>

        <input
          className="w-full mb-3 p-2 rounded bg-gray-800"
          placeholder="Email"
          value={email}
          autoComplete="username"
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <input
          className="w-full mb-3 p-2 rounded bg-gray-800"
          type="password"
          placeholder="Password"
          value={password}
          autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />

        {error && (
          <div
            role="alert"
            className="mb-3 rounded bg-red-500/10 border border-red-500/30 p-2 text-sm text-red-400"
          >
            {error}
          </div>
        )}

        <button
          onClick={submit}
          disabled={submitting || !email.trim() || !password}
          className="w-full bg-indigo-600 p-2 rounded font-bold disabled:opacity-50 transition"
        >
          {submitting ? 'Signing in…' : 'Login'}
        </button>
      </div>
    </div>
  );
}
