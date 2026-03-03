import { useEffect, useState } from 'react';
import { adminApi } from '../api/client';
import {
  Download,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  DollarSign,
} from 'lucide-react';

type Purchase = {
  _id: string;
  userId: { _id: string; username: string; email: string } | null;
  store: 'apple' | 'google';
  sku: string;
  amount: number;
  currency: string;
  state: 'CREDITED' | 'PENDING' | 'REJECTED' | 'REFUNDED';
  createdAt: string;
};

type Stats = { revenue: number; total: number; today: number };

const STATE_STYLES: Record<string, string> = {
  CREDITED: 'bg-green-500/15 text-green-400 border-green-500/30',
  PENDING: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  REJECTED: 'bg-red-500/15 text-red-400 border-red-500/30',
  REFUNDED: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
};

const SKU_COINS: Record<string, string> = {
  pq_coins_500: '🪙 500',
  pq_coins_1500: '🪙 1,500',
  pq_coins_3500: '🪙 3,500',
  pq_coins_8000: '🪙 8,000',
  pq_coins_20000: '🪙 20,000',
};

function StateIcon({ state }: { state: string }) {
  if (state === 'CREDITED') return <CheckCircle size={13} />;
  if (state === 'REJECTED' || state === 'REFUNDED')
    return <XCircle size={13} />;
  return <Clock size={13} />;
}

export default function Purchases() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [stats, setStats] = useState<Stats>({ revenue: 0, total: 0, today: 0 });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [stateFilter, setStateFilter] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchPurchases = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '30' });
      if (stateFilter) params.set('state', stateFilter);
      if (storeFilter) params.set('store', storeFilter);
      const res = await adminApi.get(`/admin/purchases?${params}`);
      setPurchases(res.data.purchases ?? []);
      setTotal(res.data.total ?? 0);
      // server returns stats.count (not stats.total) — normalise here
      const raw = res.data.stats ?? {};
      setStats({
        revenue: raw.revenue ?? 0,
        total: raw.count ?? raw.total ?? 0,
        today: raw.today ?? 0,
      });
    } catch (e) {
      console.error('Purchases fetch error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPurchases();
  }, [page, stateFilter, storeFilter]);

  const exportCSV = () =>
    window.open(`${adminApi.defaults.baseURL}/admin/purchases/csv`, '_blank');

  return (
    <div className="text-white">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold">Coin Purchases</h1>
          <p className="text-gray-400 text-sm mt-1">In-app purchase history</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm font-semibold transition"
          >
            <Download size={14} /> Export CSV
          </button>
          <button
            onClick={fetchPurchases}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-lg text-sm font-semibold transition"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* STATS CARDS */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          {
            label: 'Total Revenue',
            value: `$${stats.revenue.toFixed(2)}`,
            icon: <DollarSign size={20} className="text-green-400" />,
            color: 'text-green-400',
          },
          {
            label: 'Total Purchases',
            value: stats.total.toLocaleString(),
            icon: <CheckCircle size={20} className="text-indigo-400" />,
            color: 'text-white',
          },
          {
            label: 'Purchases Today',
            value: stats.today.toLocaleString(),
            icon: <Clock size={20} className="text-yellow-400" />,
            color: 'text-yellow-400',
          },
        ].map((card) => (
          <div
            key={card.label}
            className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex items-center gap-4"
          >
            <div className="p-3 bg-gray-800 rounded-xl">{card.icon}</div>
            <div>
              <p className="text-gray-400 text-xs mb-1">{card.label}</p>
              <p className={`text-2xl font-extrabold ${card.color}`}>
                {card.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* FILTERS */}
      <div className="flex gap-2 mb-5 flex-wrap">
        <div className="flex gap-1.5">
          {[
            ['', 'All States'],
            ['CREDITED', 'Credited'],
            ['PENDING', 'Pending'],
            ['REJECTED', 'Rejected'],
            ['REFUNDED', 'Refunded'],
          ].map(([val, label]) => (
            <button
              key={val}
              onClick={() => {
                setStateFilter(val);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${stateFilter === val ? 'bg-indigo-600' : 'bg-gray-800 hover:bg-gray-700'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {[
            ['', 'All Stores'],
            ['apple', '🍎 Apple'],
            ['google', '🤖 Google'],
          ].map(([val, label]) => (
            <button
              key={val}
              onClick={() => {
                setStoreFilter(val);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${storeFilter === val ? 'bg-indigo-600' : 'bg-gray-800 hover:bg-gray-700'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* TABLE */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/80 text-gray-400 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">User</th>
              <th className="px-4 py-3 text-left">Store</th>
              <th className="px-4 py-3 text-left">Package</th>
              <th className="px-4 py-3 text-left">Amount</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Date</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center py-14 text-gray-500">
                  Loading…
                </td>
              </tr>
            ) : purchases.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-14 text-gray-500">
                  No purchases found
                </td>
              </tr>
            ) : (
              purchases.map((p) => (
                <tr
                  key={p._id}
                  className="border-t border-gray-800 hover:bg-gray-800/30 transition"
                >
                  <td className="px-4 py-3">
                    <p className="font-semibold">
                      {p.userId?.username ?? (
                        <span className="text-gray-500 italic">deleted</span>
                      )}
                    </p>
                    <p className="text-gray-500 text-xs">
                      {p.userId?.email ?? '—'}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm">
                      {p.store === 'apple' ? '🍎 Apple' : '🤖 Google'}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {SKU_COINS[p.sku] ?? p.sku}
                  </td>
                  <td className="px-4 py-3 text-green-400 font-bold">
                    ${p.amount?.toFixed(2) ?? '—'}{' '}
                    {p.currency !== 'USD' && (
                      <span className="text-gray-500 font-normal">
                        {p.currency}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${STATE_STYLES[p.state] ?? ''}`}
                    >
                      <StateIcon state={p.state} />
                      {p.state}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(p.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {total > 30 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
            <span className="text-gray-400 text-sm">{total} purchases</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 rounded bg-gray-800 disabled:opacity-40 text-sm"
              >
                Prev
              </button>
              <span className="px-3 py-1 text-sm text-gray-400">
                Page {page}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page * 30 >= total}
                className="px-3 py-1 rounded bg-gray-800 disabled:opacity-40 text-sm"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
