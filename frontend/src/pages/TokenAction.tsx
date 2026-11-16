import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { apiPost } from '../services/api';
import { useRestaurantName } from '../context/RestaurantContext';

type Mode = 'verify-email' | 'reset-password';

function passwordValid(pw: string): string | null {
  if (pw.length < 8) return 'Use at least 8 characters.';
  if (!/[A-Z]/.test(pw)) return 'Add an uppercase letter.';
  if (!/[a-z]/.test(pw)) return 'Add a lowercase letter.';
  if (!/[0-9]/.test(pw)) return 'Add a digit.';
  if (!/[^A-Za-z0-9]/.test(pw)) return 'Add a special character.';
  return null;
}

/**
 * Handles the token-bearing links emailed to customers:
 *  - /r/verify-email?token=...   -> POST /api/auth/verify-email
 *  - /r/reset-password?token=... -> POST /api/auth/reset-password
 * The token is a one-time secret read from the query string and never logged.
 */
export default function TokenAction({ mode }: { mode: Mode }) {
  const restaurantName = useRestaurantName();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const isReset = mode === 'reset-password';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) { setStatus('error'); setMessage('This link is missing its token. Request a new one.'); return; }
    if (isReset) {
      const problem = passwordValid(password);
      if (problem) { setStatus('error'); setMessage(problem); return; }
      if (password !== confirm) { setStatus('error'); setMessage('Passwords do not match.'); return; }
    }
    setStatus('loading');
    setMessage('');
    try {
      if (isReset) {
        await apiPost('/api/auth/reset-password', { token, password });
      } else {
        await apiPost('/api/auth/verify-email', { token });
      }
      setStatus('done');
      setMessage(isReset ? 'Your password has been reset. You can now log in.' : 'Email verified! You can now log in.');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'This link is invalid or has expired. Request a new one.');
    }
  };

  return (
    <div className="container-page py-16 flex justify-center">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1)] p-8 text-center">
        <h1 className="text-2xl font-heading font-bold text-zinc-900">
          {isReset ? 'Reset your password' : 'Verify your email'}
        </h1>
        <p className="text-sm text-zinc-500 mt-2">
          {restaurantName || 'Restaurant'} · {isReset ? 'Choose a new password for your account.' : 'Confirm your email address to finish setting up your account.'}
        </p>

        {status === 'done' ? (
          <div className="mt-8">
            <CheckCircle size={40} className="mx-auto text-emerald-600" />
            <p className="text-sm text-emerald-700 mt-3">{message}</p>
            <Link to="/r/login" className="inline-block mt-6 px-6 py-3 rounded-full bg-brand-600 text-white font-semibold">Go to Login</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-8 text-left space-y-4">
            {isReset && (
              <>
                <div>
                  <label htmlFor="new-password" className="text-xs font-medium text-zinc-700">New password</label>
                  <input id="new-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                    className="mt-1.5 w-full px-3 py-3 rounded-2xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
                </div>
                <div>
                  <label htmlFor="confirm-password" className="text-xs font-medium text-zinc-700">Confirm password</label>
                  <input id="confirm-password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                    className="mt-1.5 w-full px-3 py-3 rounded-2xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
                </div>
              </>
            )}
            {status === 'error' && (
              <p className="text-sm text-red-600 flex items-center gap-2"><AlertCircle size={16} /> {message}</p>
            )}
            <button type="submit" disabled={status === 'loading' || !token}
              className="w-full py-3.5 rounded-full bg-brand-600 text-white font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2">
              {status === 'loading' ? <><Loader2 size={16} className="animate-spin" /> Working…</> : isReset ? 'Reset password' : 'Verify email'}
            </button>
            {!token && <p className="text-xs text-zinc-400 text-center">Open the link from your email to continue.</p>}
          </form>
        )}
      </div>
    </div>
  );
}
