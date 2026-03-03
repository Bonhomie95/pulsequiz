import { useEffect, useState } from 'react';
import { adminApi } from '../api/client';
import { Crown, RefreshCw, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';

type Subscription = {
  _id: string;
  userId: { username: string; email: string } | null;
  store: 'apple' | 'google';
  sku: string;
  status: 'active' | 'expired' | 'cancelled' | 'grace';
  startedAt: string;
  expiresAt: string;
  renewedAt?: string;
};

type Stats = { active: number; grace: number; expired: number; revenue: number };

const STATUS_META: Record<string, { label: string; cls: string }> = {
  active:    { label: 'Active',    cls: 'bg-green-500/15 text-green-400 border-green-500/30' },
  grace:     { label: 'Grace',     cls: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  cancelled: { label: 'Cancelled', cls: 'bg-red-500/15 text-red-400 border-red-500/30' },
  expired:   { label: 'Expired',   cls: 'bg-gray-500/15 text-gray-400 border-gray-500/30' },
};

const SKU_LABELS: Record<string, string> = {
  pq_premium_monthly: 'Monthly',
  pq_premium_3month:  '3 Months',
  pq_premium_6month:  '6 Months',
  pq_premium_yearly:  'Annual',
};

export default function Subscriptions() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [stats, setStats] = useState<Stats>({ active: 0, grace: 0, expired: 0, revenue: 0 });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('active');
  const [loading, setLoading] = useState(true);

  const fetchSubs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '30' });
      if (statusFilter) params.set('status', statusFilter);
      const res = await adminApi.get(`/admin/subscriptions?${params}`);
      setSubs(res.data.subscriptions ?? []);
      setTotal(res.data.total ?? 0);
      setStats(res.data.stats ?? { active: 0, grace: 0, expired: 0, revenue: 0 });
    } catch (e) {
      console.error('Subscriptions fetch error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSubs(); }, [page, statusFilter]);

  const cancelSub = async (id: string, username: string) => {
    if (!confirm(`Cancel subscription for @${username}? This will mark it as cancelled.`)) return;
    try {
      await adminApi.patch(`/admin/subscriptions/${id}/cancel`);
      fetchSubs();
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Error cancelling');
    }
  };

  return (
    <div className="text-white">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2"><Crown size={22} className="text-yellow-400" /> Subscriptions</h1>
          <p className="text-gray-400 text-sm mt-1">Premium subscriber management</p>
        </div>
        <button onClick={fetchSubs} className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm font-semibold transition">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Active', value: stats.active, icon: <CheckCircle size={18} className="text-green-400" /> },
          { label: 'Grace Period', value: stats.grace, icon: <Clock size={18} className="text-yellow-400" /> },
          { label: 'Expired', value: stats.expired, icon: <XCircle size={18} className="text-gray-400" /> },
          { label: 'Est. MRR', value: `$${(stats.active * 2.66).toFixed(0)}`, icon: <Crown size={18} className="text-yellow-400" /> },
        ].map((s) => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex items-center gap-3">
            <div className="p-2 bg-gray-800 rounded-lg">{s.icon}</div>
            <div>
              <p className="text-gray-500 text-xs">{s.label}</p>
              <p className="text-xl font-extrabold">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* FILTERS */}
      <div className="flex gap-2 mb-5">
        {[['active', 'Active'], ['grace', 'Grace'], ['expired', 'Expired'], ['cancelled', 'Cancelled'], ['', 'All']].map(([val, label]) => (
          <button key={val} onClick={() => { setStatusFilter(val); setPage(1); }}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${statusFilter === val ? 'bg-indigo-600' : 'bg-gray-800 hover:bg-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* TABLE */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/80 text-gray-400 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">User</th>
              <th className="px-4 py-3 text-left">Plan</th>
              <th className="px-4 py-3 text-left">Store</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Started</th>
              <th className="px-4 py-3 text-left">Expires</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-14 text-gray-500">Loading…</td></tr>
            ) : subs.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-14 text-gray-500">No subscriptions found</td></tr>
            ) : subs.map((s) => {
              const meta = STATUS_META[s.status] ?? STATUS_META.expired;
              const expiring = s.status === 'active' && new Date(s.expiresAt).getTime() - Date.now() < 3 * 86400000;
              return (
                <tr key={s._id} className="border-t border-gray-800 hover:bg-gray-800/30 transition">
                  <td className="px-4 py-3">
                    <p className="font-semibold">{s.userId?.username ?? <span className="italic text-gray-500">deleted</span>}</p>
                    <p className="text-gray-500 text-xs">{s.userId?.email ?? '—'}</p>
                  </td>
                  <td className="px-4 py-3 font-medium">{SKU_LABELS[s.sku] ?? s.sku}</td>
                  <td className="px-4 py-3">{s.store === 'apple' ? '🍎 Apple' : '🤖 Google'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${meta.cls}`}>
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{new Date(s.startedAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-xs">
                    <span className={expiring ? 'text-yellow-400 font-semibold' : 'text-gray-400'}>
                      {expiring && <AlertTriangle size={11} className="inline mr-1" />}
                      {new Date(s.expiresAt).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {(s.status === 'active' || s.status === 'grace') && (
                      <button
                        onClick={() => cancelSub(s._id, s.userId?.username ?? 'user')}
                        className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-md text-xs font-bold transition"
                      >
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {total > 30 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
            <span className="text-gray-400 text-sm">{total} subscriptions</span>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded bg-gray-800 disabled:opacity-40 text-sm">Prev</button>
              <span className="px-3 py-1 text-sm text-gray-400">Page {page}</span>
              <button onClick={() => setPage((p) => p + 1)} disabled={page * 30 >= total} className="px-3 py-1 rounded bg-gray-800 disabled:opacity-40 text-sm">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
