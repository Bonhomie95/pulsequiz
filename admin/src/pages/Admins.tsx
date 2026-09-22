import { useCallback, useEffect, useState } from 'react';
import { UserCog, Plus, RefreshCw, X } from 'lucide-react';
import { adminApi } from '../api/client';
import { errMsg } from '../utils/errMsg';
import { useAdminStore } from '../store/adminStore';

type Role = 'SUPER_ADMIN' | 'MODERATOR';
type AdminRow = {
  _id: string;
  email: string;
  role: Role;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
  createdBy?: string | null;
  lockedUntil?: string | null;
};

const ROLE_HELP: Record<Role, string> = {
  SUPER_ADMIN: 'Everything: payouts, prize pools, economy settings, balances, deletions, admins, audit log.',
  MODERATOR: 'Users (view/ban), reports, questions (create/edit/upload), read-only elsewhere.',
};

function passwordProblem(p: string): string | null {
  if (p.length < 12) return 'At least 12 characters';
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return 'Needs letters and digits';
  return null;
}

export default function Admins() {
  const me = useAdminStore((s) => s.admin);
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('MODERATOR');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.get('/admin/admins');
      setAdmins(res.data.admins ?? []);
    } catch (e) {
      setError(errMsg(e, 'Could not load admins'));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    const problem = passwordProblem(password);
    if (problem) return setCreateError(problem);
    setCreating(true);
    setCreateError(null);
    try {
      await adminApi.post('/admin/admins', { email: email.trim(), password, role });
      setShowCreate(false);
      setEmail('');
      setPassword('');
      setRole('MODERATOR');
      load();
    } catch (e) {
      setCreateError(errMsg(e, 'Could not create admin'));
    } finally {
      setCreating(false);
    }
  };

  const update = async (a: AdminRow, body: Partial<{ role: Role; isActive: boolean; password: string }>, confirmText: string) => {
    if (!confirm(confirmText)) return;
    setBusy(a._id);
    try {
      await adminApi.patch(`/admin/admins/${a._id}`, body);
      load();
    } catch (e) {
      alert(errMsg(e, 'Update failed'));
    } finally {
      setBusy(null);
    }
  };

  const resetPassword = (a: AdminRow) => {
    const pw = prompt(`New password for ${a.email} (12+ characters, letters and digits):`);
    if (!pw) return;
    const problem = passwordProblem(pw);
    if (problem) return alert(problem);
    update(a, { password: pw }, `Reset the password for ${a.email}? They will need the new one to sign in.`);
  };

  return (
    <div className="text-white">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2"><UserCog size={22} className="text-indigo-400" /> Admins</h1>
          <p className="text-gray-400 text-sm mt-1">Who can sign in to this panel, and what they can do.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} aria-label="Refresh" className="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm font-semibold"><RefreshCw size={14} /></button>
          <button onClick={() => { setCreateError(null); setShowCreate(true); }} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-lg text-sm font-semibold">
            <Plus size={15} /> Add admin
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 mb-5">
        {(Object.keys(ROLE_HELP) as Role[]).map((r) => (
          <div key={r} className="rounded-xl bg-gray-900 border border-gray-800 p-4 text-sm">
            <p className="font-bold mb-1">{r}</p>
            <p className="text-gray-400 text-xs">{ROLE_HELP[r]}</p>
          </div>
        ))}
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">{error}</div>}

      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/80 text-gray-400 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left">Role</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Last login</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center py-12 text-gray-500">Loading…</td></tr>
            ) : admins.map((a) => {
              const isMe = a.email === me?.email;
              const locked = a.lockedUntil && new Date(a.lockedUntil) > new Date();
              return (
                <tr key={a._id} className="border-t border-gray-800">
                  <td className="px-4 py-3">{a.email}{isMe && <span className="ml-2 text-xs text-indigo-300">(you)</span>}</td>
                  <td className="px-4 py-3">
                    <select
                      value={a.role}
                      disabled={isMe || busy === a._id}
                      aria-label={`Role for ${a.email}`}
                      onChange={(e) => update(a, { role: e.target.value as Role }, `Change ${a.email} to ${e.target.value}?`)}
                      className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs disabled:opacity-50"
                    >
                      <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                      <option value="MODERATOR">MODERATOR</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {a.isActive ? <span className="text-green-400">Active</span> : <span className="text-red-400">Deactivated</span>}
                    {locked && <span className="ml-2 text-orange-400">Locked</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleString() : 'Never'}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => resetPassword(a)} disabled={busy === a._id} className="px-3 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs font-semibold disabled:opacity-40">
                        Reset password
                      </button>
                      {!isMe && (
                        <button
                          onClick={() => update(a, { isActive: !a.isActive }, `${a.isActive ? 'Deactivate' : 'Reactivate'} ${a.email}?`)}
                          disabled={busy === a._id}
                          className={`px-3 py-1 rounded-lg text-xs font-semibold disabled:opacity-40 ${a.isActive ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'}`}
                        >
                          {a.isActive ? 'Deactivate' : 'Reactivate'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Add admin">
          <div className="absolute inset-0 bg-black/70" onClick={() => setShowCreate(false)} />
          <div className="relative bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">Add admin</h3>
              <button onClick={() => setShowCreate(false)} aria-label="Close" className="p-1.5 rounded-lg hover:bg-gray-800"><X size={16} /></button>
            </div>
            <label className="block text-xs text-gray-400">Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off"
                className="mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500" />
            </label>
            <label className="block text-xs text-gray-400">Temporary password (12+ chars, letters and digits)
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password"
                className="mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500" />
            </label>
            <label className="block text-xs text-gray-400">Role
              <select value={role} onChange={(e) => setRole(e.target.value as Role)}
                className="mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white">
                <option value="MODERATOR">MODERATOR</option>
                <option value="SUPER_ADMIN">SUPER_ADMIN</option>
              </select>
            </label>
            <p className="text-xs text-gray-500">{ROLE_HELP[role]}</p>
            {createError && <p className="text-sm text-red-400">{createError}</p>}
            <button onClick={create} disabled={creating || !email.includes('@') || !password}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 py-2.5 rounded-xl font-bold text-sm">
              {creating ? 'Creating…' : 'Create admin'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
