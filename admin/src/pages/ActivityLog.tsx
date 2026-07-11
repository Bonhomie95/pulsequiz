import { useEffect, useState } from 'react';
import { adminApi } from '../api/client';
import { Activity, RefreshCw, Search } from 'lucide-react';

type ActivityItem = {
  _id: string;
  userId: { _id: string; username: string; email: string } | null;
  type: string;
  meta?: Record<string, any>;
  createdAt: string;
};

const TYPE_META: Record<string, { color: string; emoji: string }> = {
  QUIZ_START: {
    color: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    emoji: '▶️',
  },
  QUIZ_FINISH: {
    color: 'bg-green-500/15 text-green-400 border-green-500/30',
    emoji: '✅',
  },
  PURCHASE: {
    color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    emoji: '🪙',
  },
  CHECK_IN: {
    color: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    emoji: '🔥',
  },
  PROFILE_UPDATE: {
    color: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
    emoji: '✏️',
  },
  BAN: { color: 'bg-red-500/15 text-red-400 border-red-500/30', emoji: '🚫' },
};

function metaSummary(type: string, meta?: Record<string, any>): string {
  if (!meta) return '';
  switch (type) {
    case 'QUIZ_FINISH':
      return meta.points != null ? `+${meta.points} pts` : '';
    case 'PURCHASE':
      return meta.sku ? meta.sku : '';
    case 'CHECK_IN':
      return meta.streak ? `Streak: ${meta.streak}d` : '';
    default:
      return '';
  }
}

export default function ActivityLog() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(100);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchActivity = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (typeFilter) params.set('type', typeFilter);
      if (search.trim()) params.set('search', search.trim());
      const res = await adminApi.get(`/admin/activity?${params}`);
      setItems(res.data ?? []);
    } catch (e) {
      console.error('Activity fetch error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActivity();
  }, [typeFilter, limit]);

  // Auto-refresh every 10s when enabled
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => fetchActivity(), 10_000);
    return () => clearInterval(id);
  }, [autoRefresh, typeFilter, limit]);

  const filtered = search.trim()
    ? items.filter(
        (a) =>
          (a.userId?.username ?? '')
            .toLowerCase()
            .includes(search.toLowerCase()) ||
          (a.userId?.email ?? '').toLowerCase().includes(search.toLowerCase()),
      )
    : items;

  const TYPES = [
    '',
    'QUIZ_START',
    'QUIZ_FINISH',
    'PURCHASE',
    'CHECK_IN',
    'PROFILE_UPDATE',
    'BAN',
  ];

  return (
    <div className="text-white">
      {/* HEADER */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2">
            <Activity size={22} className="text-indigo-400" /> Activity Log
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            User events across the platform
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${autoRefresh ? 'bg-green-600' : 'bg-gray-800 hover:bg-gray-700'}`}
          >
            {autoRefresh ? '🟢 Live' : 'Auto-refresh'}
          </button>
          <button
            onClick={fetchActivity}
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm font-semibold transition"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* CONTROLS */}
      <div className="flex flex-wrap gap-3 mb-5">
        {/* Search */}
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by username…"
            className="bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:border-indigo-500 transition w-52"
          />
        </div>

        {/* Type filter */}
        <div className="flex gap-1.5 flex-wrap">
          {TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${typeFilter === t ? 'bg-indigo-600' : 'bg-gray-800 hover:bg-gray-700'}`}
            >
              {t || 'All'} {t && TYPE_META[t]?.emoji}
            </button>
          ))}
        </div>

        {/* Limit */}
        <select
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 transition"
        >
          <option value={50}>Last 50</option>
          <option value={100}>Last 100</option>
          <option value={250}>Last 250</option>
          <option value={500}>Last 500</option>
        </select>
      </div>

      {/* TABLE */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/80 text-gray-400 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">Time</th>
              <th className="px-4 py-3 text-left">User</th>
              <th className="px-4 py-3 text-left">Event</th>
              <th className="px-4 py-3 text-left">Details</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="text-center py-14 text-gray-500">
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-14 text-gray-500">
                  No activity found
                </td>
              </tr>
            ) : (
              filtered.map((a) => {
                const meta = TYPE_META[a.type] ?? {
                  color: 'bg-gray-700 text-gray-300 border-gray-600',
                  emoji: '•',
                };
                const summary = metaSummary(a.type, a.meta);
                return (
                  <tr
                    key={a._id}
                    className="border-t border-gray-800 hover:bg-gray-800/30 transition"
                  >
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {new Date(a.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      {a.userId ? (
                        <>
                          <p className="font-semibold">{a.userId.username}</p>
                          <p className="text-gray-500 text-xs">
                            {a.userId.email}
                          </p>
                        </>
                      ) : (
                        <span className="text-gray-600 italic text-xs">
                          deleted user
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${meta.color}`}
                      >
                        {meta.emoji} {a.type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {summary ||
                        (a.meta ? JSON.stringify(a.meta).slice(0, 60) : '—')}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        <div className="px-4 py-3 border-t border-gray-800 flex items-center justify-between">
          <span className="text-gray-500 text-xs">
            {filtered.length} events shown
          </span>
          {filtered.length >= limit && (
            <button
              onClick={() => setLimit((l) => l + 100)}
              className="text-indigo-400 text-xs hover:underline"
            >
              Load more
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
