import { useEffect, useState } from 'react';
import { adminApi } from '../api/client';
import { Swords, RefreshCw, Plus, Trash2, X } from 'lucide-react';

type Challenge = {
  _id: string;
  userId: string;
  type: 'daily' | 'weekly';
  metric: 'quizzes_played' | 'correct_answers' | 'perfect_scores';
  title: string;
  description?: string;
  category?: string;
  targetValue: number;
  progress?: number;
  rewardCoins: number;
  rewardPoints: number;
  status: string;
  createdAt: string;
  expiresAt?: string;
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-blue-500/15 text-blue-400',
  completed: 'bg-green-500/15 text-green-400',
  claimed: 'bg-indigo-500/15 text-indigo-400',
  expired: 'bg-gray-500/15 text-gray-400',
};

const EMPTY = {
  userId: '',
  type: 'daily' as 'daily' | 'weekly',
  metric: 'quizzes_played' as Challenge['metric'],
  title: '',
  description: '',
  targetValue: 5,
  rewardCoins: 50,
  rewardPoints: 0,
};

export default function Challenges() {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchChallenges = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter) params.set('type', typeFilter);
      if (userFilter.trim()) params.set('userId', userFilter.trim());
      const res = await adminApi.get(`/admin/challenges?${params}`);
      setChallenges(res.data.challenges ?? []);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Could not load challenges');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChallenges();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, typeFilter]);

  const create = async () => {
    setSaving(true);
    setError(null);
    try {
      await adminApi.post('/admin/challenges', {
        ...form,
        targetValue: Number(form.targetValue),
        rewardCoins: Number(form.rewardCoins),
        rewardPoints: Number(form.rewardPoints),
      });
      setShowCreate(false);
      setForm({ ...EMPTY });
      fetchChallenges();
    } catch (e: any) {
      const d = e?.response?.data;
      setError(d?.errors?.join('\n') ?? d?.message ?? 'Could not create challenge');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this challenge? Any unclaimed reward is forfeited.')) return;
    try {
      await adminApi.delete(`/admin/challenges/${id}`);
      fetchChallenges();
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Could not delete');
    }
  };

  return (
    <div className="text-white">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2">
            <Swords size={22} className="text-indigo-400" /> Challenges
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            {challenges.length} shown (most recent 200)
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchChallenges}
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm font-semibold transition"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-lg text-sm font-semibold transition"
          >
            <Plus size={15} /> Assign Challenge
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <input
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && fetchChallenges()}
          placeholder="Filter by user ID…"
          className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 min-w-[220px]"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm outline-none"
        >
          <option value="">All statuses</option>
          {['active', 'completed', 'claimed', 'expired'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm outline-none"
        >
          <option value="">All types</option>
          <option value="daily">daily</option>
          <option value="weekly">weekly</option>
        </select>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-400 whitespace-pre-wrap">
          {error}
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/80 text-gray-400 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">Challenge</th>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-left">Progress</th>
              <th className="px-4 py-3 text-left">Reward</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {challenges.map((c) => (
              <tr key={c._id} className="border-t border-gray-800 hover:bg-gray-800/40">
                <td className="px-4 py-3">
                  <div className="font-semibold">{c.title}</div>
                  <div className="text-[11px] text-gray-500">
                    {c.metric}
                    {c.category ? ` · ${c.category}` : ''}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-400">{c.type}</td>
                <td className="px-4 py-3 text-gray-300">
                  {c.progress ?? 0} / {c.targetValue}
                </td>
                <td className="px-4 py-3 text-yellow-400">
                  {c.rewardCoins ? `${c.rewardCoins} coins` : ''}
                  {c.rewardCoins && c.rewardPoints ? ' · ' : ''}
                  {c.rewardPoints ? `${c.rewardPoints} pts` : ''}
                  {!c.rewardCoins && !c.rewardPoints ? '—' : ''}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                      STATUS_COLORS[c.status] ?? 'bg-gray-700 text-gray-300'
                    }`}
                  >
                    {c.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => remove(c._id)}
                    className="p-1.5 rounded-lg hover:bg-red-600/20 text-red-400 transition"
                    title="Delete challenge"
                  >
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
            {!loading && challenges.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                  No challenges match these filters.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setShowCreate(false)} />
          <div className="relative bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <h3 className="font-bold text-lg">Assign a Challenge</h3>
              <button
                onClick={() => setShowCreate(false)}
                className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-white transition"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-gray-500">
                Grants coins and leaderboard points, so this is restricted to
                SUPER_ADMIN and written to the audit log.
              </p>
              <Field label="User ID">
                <input
                  value={form.userId}
                  onChange={(e) => setForm({ ...form, userId: e.target.value })}
                  placeholder="Mongo ObjectId"
                  className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm outline-none border border-gray-700 focus:border-indigo-500"
                />
              </Field>
              <Field label="Title">
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm outline-none border border-gray-700 focus:border-indigo-500"
                />
              </Field>
              <Field label="Description">
                <input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm outline-none border border-gray-700 focus:border-indigo-500"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Type">
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value as any })}
                    className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm outline-none border border-gray-700"
                  >
                    <option value="daily">daily</option>
                    <option value="weekly">weekly</option>
                  </select>
                </Field>
                <Field label="Metric">
                  <select
                    value={form.metric}
                    onChange={(e) => setForm({ ...form, metric: e.target.value as any })}
                    className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm outline-none border border-gray-700"
                  >
                    <option value="quizzes_played">quizzes_played</option>
                    <option value="correct_answers">correct_answers</option>
                    <option value="perfect_scores">perfect_scores</option>
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Target">
                  <input
                    type="number"
                    value={form.targetValue}
                    onChange={(e) => setForm({ ...form, targetValue: Number(e.target.value) })}
                    className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm outline-none border border-gray-700"
                  />
                </Field>
                <Field label="Coins">
                  <input
                    type="number"
                    value={form.rewardCoins}
                    onChange={(e) => setForm({ ...form, rewardCoins: Number(e.target.value) })}
                    className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm outline-none border border-gray-700"
                  />
                </Field>
                <Field label="Points">
                  <input
                    type="number"
                    value={form.rewardPoints}
                    onChange={(e) => setForm({ ...form, rewardPoints: Number(e.target.value) })}
                    className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm outline-none border border-gray-700"
                  />
                </Field>
              </div>
              <button
                onClick={create}
                disabled={saving || !form.userId.trim() || form.title.trim().length < 3}
                className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50 transition"
              >
                {saving ? 'Assigning…' : 'Assign Challenge'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-gray-400">{label}</span>
      {children}
    </label>
  );
}
