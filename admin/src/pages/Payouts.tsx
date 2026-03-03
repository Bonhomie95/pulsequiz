import { useEffect, useState } from 'react';
import { adminApi } from '../api/client';
import { Download, RefreshCw, Plus, Trophy, AlertTriangle, CheckCircle, Clock, XCircle } from 'lucide-react';

type Payout = {
  _id: string;
  userId: { username: string; email: string } | string;
  amount: number;
  rank: number;
  period: string;
  periodLabel: string;
  usdtAddress: string;
  usdtType: string;
  status: 'pending' | 'sent' | 'confirmed' | 'failed' | 'skipped';
  txHash?: string;
  retries: number;
  createdAt: string;
  sentAt?: string;
};

type PrizePool = {
  _id?: string;
  type: 'weekly' | 'monthly';
  periodLabel: string;
  totalAmount: number;
  paidRanks: number;
  tiers: { rank: number; amount: number }[];
  lockedAt?: string;
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'text-yellow-400 bg-yellow-400/10',
  sent: 'text-blue-400 bg-blue-400/10',
  confirmed: 'text-green-400 bg-green-400/10',
  failed: 'text-red-400 bg-red-400/10',
  skipped: 'text-gray-400 bg-gray-400/10',
};

const StatusIcon = ({ status }: { status: string }) => {
  if (status === 'confirmed' || status === 'sent') return <CheckCircle size={14} />;
  if (status === 'failed' || status === 'skipped') return <XCircle size={14} />;
  return <Clock size={14} />;
};

function getCurrentPeriodLabel(type: 'weekly' | 'monthly') {
  const now = new Date();
  if (type === 'monthly') {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((now.getTime() - jan1.getTime()) / 86400000);
  const week = Math.ceil((dayOfYear + jan1.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

export default function Payouts() {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [pools, setPools] = useState<PrizePool[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'payouts' | 'pools'>('payouts');

  // Prize pool form
  const [poolForm, setPoolForm] = useState({
    type: 'weekly' as 'weekly' | 'monthly',
    periodLabel: getCurrentPeriodLabel('weekly'),
    totalAmount: 0,
    paidRanks: 10,
    tiers: Array.from({ length: 10 }, (_, i) => ({ rank: i + 1, amount: 0 })),
  });
  const [saving, setSaving] = useState(false);
  const [triggerType, setTriggerType] = useState<'weekly' | 'monthly'>('weekly');
  const [triggering, setTriggering] = useState(false);

  const fetchPayouts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '30' });
      if (statusFilter) params.set('status', statusFilter);
      const res = await adminApi.get(`/admin/payouts?${params}`);
      setPayouts(res.data.payouts ?? []);
      setTotal(res.data.total ?? 0);
    } catch {
        console.error('Error fetching payouts');
     } finally { setLoading(false); }
  };

  const fetchPools = async () => {
    try {
      const res = await adminApi.get('/admin/payouts/prize-pools');
      setPools(res.data.pools ?? []);
    } catch { 
        console.error('Error fetching prize pools');
    }
  };

  useEffect(() => { fetchPayouts(); }, [page, statusFilter]);
  useEffect(() => { fetchPools(); }, []);

  const retryPayout = async (id: string) => {
    if (!confirm('Retry this failed payout?')) return;
    await adminApi.post(`/admin/payouts/${id}/retry`);
    fetchPayouts();
  };

  const exportCSV = () => {
    window.open(`${adminApi.defaults.baseURL}/admin/payouts/csv`, '_blank');
  };

  const updateTier = (rank: number, amount: number) => {
    setPoolForm((f) => ({
      ...f,
      tiers: f.tiers.map((t) => (t.rank === rank ? { ...t, amount } : t)),
    }));
  };

  const updatePaidRanks = (n: number) => {
    setPoolForm((f) => ({
      ...f,
      paidRanks: n,
      tiers: Array.from({ length: n }, (_, i) => ({
        rank: i + 1,
        amount: f.tiers[i]?.amount ?? 0,
      })),
    }));
  };

  const updatePoolType = (type: 'weekly' | 'monthly') => {
    setPoolForm((f) => ({ ...f, type, periodLabel: getCurrentPeriodLabel(type) }));
  };

  const tierSum = poolForm.tiers.reduce((s, t) => s + t.amount, 0);
  const tierValid = tierSum <= poolForm.totalAmount;

  const savePool = async () => {
    if (!tierValid) return alert('Tier amounts exceed total pool!');
    setSaving(true);
    try {
      await adminApi.post('/admin/payouts/prize-pools', poolForm);
      alert('Prize pool saved!');
      fetchPools();
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Error saving pool');
    } finally { setSaving(false); }
  };

  const triggerPayout = async () => {
    if (!confirm(`Manually trigger ${triggerType} payout now? This is irreversible.`)) return;
    setTriggering(true);
    try {
      const res = await adminApi.post('/admin/payouts/trigger', { type: triggerType });
      alert(`Payout triggered. Results: ${JSON.stringify(res.data?.results?.length ?? 0)} users processed.`);
      fetchPayouts();
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Trigger failed');
    } finally { setTriggering(false); }
  };

  const getUsername = (u: Payout['userId']) => {
    if (typeof u === 'object' && u !== null) return u.username;
    return String(u).slice(-8);
  };

  return (
    <div className="text-white">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold">Payouts</h1>
          <p className="text-gray-400 text-sm mt-1">Manage USDT prize pools and track all payouts</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm font-semibold transition"
          >
            <Download size={15} /> Export CSV
          </button>
          <button
            onClick={fetchPayouts}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-lg text-sm font-semibold transition"
          >
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
      </div>

      {/* TABS */}
      <div className="flex gap-2 mb-6">
        {(['payouts', 'pools'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg font-semibold text-sm capitalize transition ${tab === t ? 'bg-indigo-600' : 'bg-gray-800 hover:bg-gray-700'}`}
          >
            {t === 'payouts' ? '💸 Payout Records' : '🏆 Prize Pools'}
          </button>
        ))}
      </div>

      {/* ─── PAYOUT RECORDS ─── */}
      {tab === 'payouts' && (
        <>
          {/* FILTERS */}
          <div className="flex gap-2 mb-4 flex-wrap">
            {['', 'pending', 'sent', 'confirmed', 'failed', 'skipped'].map((s) => (
              <button
                key={s}
                onClick={() => { setStatusFilter(s); setPage(1); }}
                className={`px-3 py-1 rounded-lg text-sm font-semibold transition capitalize ${statusFilter === s ? 'bg-indigo-600' : 'bg-gray-800 hover:bg-gray-700'}`}
              >
                {s || 'All'}
              </button>
            ))}
          </div>

          {/* MANUAL TRIGGER */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-4 flex items-center gap-4">
            <AlertTriangle size={18} className="text-yellow-400 shrink-0" />
            <span className="text-sm text-gray-300 flex-1">
              <span className="font-bold text-white">Manual Trigger:</span> Only use if cron failed. This sends real USDT.
            </span>
            <select
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value as any)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white"
            >
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <button
              onClick={triggerPayout}
              disabled={triggering}
              className="bg-red-600 hover:bg-red-500 disabled:opacity-50 px-4 py-1.5 rounded-lg text-sm font-bold transition"
            >
              {triggering ? 'Running…' : 'Trigger Now'}
            </button>
          </div>

          {/* TABLE */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-800 text-gray-400">
                <tr>
                  <th className="px-4 py-3 text-left">User</th>
                  <th className="px-4 py-3 text-left">Amount</th>
                  <th className="px-4 py-3 text-left">Rank</th>
                  <th className="px-4 py-3 text-left">Period</th>
                  <th className="px-4 py-3 text-left">USDT Address</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Retries</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} className="text-center py-10 text-gray-500">Loading…</td></tr>
                ) : payouts.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-10 text-gray-500">No payouts found</td></tr>
                ) : (
                  payouts.map((p) => (
                    <tr key={p._id} className="border-t border-gray-800 hover:bg-gray-800/50 transition">
                      <td className="px-4 py-3 font-semibold">{getUsername(p.userId)}</td>
                      <td className="px-4 py-3 text-green-400 font-bold">${p.amount.toFixed(2)}</td>
                      <td className="px-4 py-3">#{p.rank}</td>
                      <td className="px-4 py-3 text-gray-400">{p.period} • {p.periodLabel}</td>
                      <td className="px-4 py-3 text-xs text-gray-400 max-w-32 truncate">
                        <span title={p.usdtAddress}>{p.usdtType}: {p.usdtAddress.slice(0, 8)}…</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold capitalize ${STATUS_COLORS[p.status]}`}>
                          <StatusIcon status={p.status} />{p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400">{p.retries}/3</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {new Date(p.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        {p.status === 'failed' && (
                          <button
                            onClick={() => retryPayout(p._id)}
                            className="bg-yellow-500 hover:bg-yellow-400 text-black px-2 py-1 rounded-md text-xs font-bold transition"
                          >
                            Retry
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* PAGINATION */}
            {total > 30 && (
              <div className="flex justify-between items-center px-4 py-3 border-t border-gray-800">
                <span className="text-gray-400 text-sm">{total} total payouts</span>
                <div className="flex gap-2">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded bg-gray-800 disabled:opacity-40 text-sm">Prev</button>
                  <span className="px-3 py-1 text-sm text-gray-400">Page {page}</span>
                  <button onClick={() => setPage((p) => p + 1)} disabled={page * 30 >= total} className="px-3 py-1 rounded bg-gray-800 disabled:opacity-40 text-sm">Next</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ─── PRIZE POOLS ─── */}
      {tab === 'pools' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* EXISTING POOLS */}
          <div>
            <h2 className="text-lg font-bold mb-3 text-gray-200">Active Prize Pools</h2>
            {pools.length === 0 ? (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center text-gray-500">
                <Trophy size={32} className="mx-auto mb-3 opacity-30" />
                No prize pools configured yet.
              </div>
            ) : (
              pools.map((pool) => (
                <div key={pool._id} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-3">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="capitalize font-bold text-indigo-400">{pool.type}</span>
                      <span className="ml-2 text-gray-400 text-sm">{pool.periodLabel}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {pool.lockedAt && (
                        <span className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full">Locked</span>
                      )}
                      <span className="text-green-400 font-bold">${pool.totalAmount} USDT</span>
                    </div>
                  </div>
                  <div className="text-sm text-gray-400 mb-3">
                    Top <span className="text-white font-bold">{pool.paidRanks}</span> players paid
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {pool.tiers.map((t) => (
                      <div key={t.rank} className="bg-gray-800 rounded-lg px-2 py-1 text-xs flex justify-between">
                        <span className="text-gray-400">#{t.rank}</span>
                        <span className="text-green-400 font-bold">${t.amount}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* CREATE / EDIT POOL */}
          <div>
            <h2 className="text-lg font-bold mb-3 text-gray-200">
              <Plus size={18} className="inline mr-2" />
              Set Prize Pool
            </h2>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Type</label>
                  <select
                    value={poolForm.type}
                    onChange={(e) => updatePoolType(e.target.value as any)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
                  >
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Period Label</label>
                  <input
                    value={poolForm.periodLabel}
                    onChange={(e) => setPoolForm((f) => ({ ...f, periodLabel: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
                    placeholder="2026-W08"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Total Pool (USDT)</label>
                  <input
                    type="number"
                    min={0}
                    value={poolForm.totalAmount}
                    onChange={(e) => setPoolForm((f) => ({ ...f, totalAmount: Number(e.target.value) }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Paid Ranks (Top N)</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={poolForm.paidRanks}
                    onChange={(e) => updatePaidRanks(Number(e.target.value))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
                  />
                </div>
              </div>

              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs text-gray-400">Prize per Rank (USDT)</label>
                <span className={`text-xs font-bold ${tierValid ? 'text-green-400' : 'text-red-400'}`}>
                  Sum: ${tierSum.toFixed(2)} / ${poolForm.totalAmount}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5 mb-4 max-h-52 overflow-y-auto pr-1">
                {poolForm.tiers.map((t) => (
                  <div key={t.rank} className="flex items-center gap-2 bg-gray-800 rounded-lg px-2 py-1">
                    <span className="text-xs text-gray-400 w-8 shrink-0">#{t.rank}</span>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={t.amount}
                      onChange={(e) => updateTier(t.rank, Number(e.target.value))}
                      className="flex-1 bg-transparent text-sm text-white outline-none min-w-0"
                    />
                    <span className="text-xs text-gray-500">$</span>
                  </div>
                ))}
              </div>

              {!tierValid && (
                <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 mb-3">
                  <AlertTriangle size={14} className="text-red-400 shrink-0" />
                  <span className="text-red-400 text-xs">Tier amounts (${tierSum}) exceed total pool (${poolForm.totalAmount}). Reduce individual prizes.</span>
                </div>
              )}

              <button
                onClick={savePool}
                disabled={saving || !tierValid || poolForm.totalAmount <= 0}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed py-2.5 rounded-lg font-bold text-sm transition"
              >
                {saving ? 'Saving…' : 'Save Prize Pool'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
