import { useEffect, useState } from 'react';
import { adminApi } from '../api/client';
import { Trophy, RefreshCw } from 'lucide-react';

type LeaderboardEntry = {
  rank: number;
  userId: string;
  username: string;
  avatar?: string;
  score: number;
};

type BoardType = 'weekly' | 'monthly' | 'all';

// Avatar keys map to consistent colors + emoji — admin web can't use require()
const AVATAR_COLORS: Record<string, { bg: string; emoji: string }> = {
  avatar0: { bg: '#6366F1', emoji: '🦊' },
  avatar1: { bg: '#EC4899', emoji: '🐼' },
  avatar2: { bg: '#10B981', emoji: '🦁' },
  avatar3: { bg: '#F59E0B', emoji: '🐯' },
  avatar4: { bg: '#3B82F6', emoji: '🐺' },
  avatar5: { bg: '#8B5CF6', emoji: '🦋' },
};

function AvatarCell({
  avatar,
  username,
}: {
  avatar?: string;
  username: string;
}) {
  const mapped = avatar ? AVATAR_COLORS[avatar] : null;

  if (mapped) {
    return (
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-base flex-shrink-0"
        style={{
          backgroundColor: mapped.bg + '33',
          border: `1.5px solid ${mapped.bg}66`,
        }}
        title={avatar}
      >
        {mapped.emoji}
      </div>
    );
  }

  // Fallback: colored initial
  const initial = username?.[0]?.toUpperCase() ?? '?';
  return (
    <div className="w-8 h-8 rounded-full bg-indigo-500/25 border border-indigo-500/40 flex items-center justify-center text-xs font-bold text-indigo-300 flex-shrink-0">
      {initial}
    </div>
  );
}

const RANK_STYLE = (rank: number): string => {
  if (rank === 1) return 'text-yellow-400 font-black text-base';
  if (rank === 2) return 'text-gray-300 font-black';
  if (rank === 3) return 'text-amber-600 font-black';
  return 'text-gray-500';
};

const RANK_ICON = (rank: number) => {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return null;
};

export default function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [type, setType] = useState<BoardType>('weekly');
  const [loading, setLoading] = useState(true);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [search, setSearch] = useState('');

  const fetchLeaderboard = async (boardType: BoardType = type) => {
    setLoading(true);
    try {
      const res = await adminApi.get(`/admin/leaderboard/${boardType}`);
      const raw: any[] = res.data.data ?? [];
      const normalised: LeaderboardEntry[] = raw.map((e: any, i: number) => ({
        rank: e.rank ?? i + 1,
        userId: e.userId ?? '',
        username: e.username ?? 'Unknown',
        avatar: e.avatar,
        score: e.points ?? e.score ?? 0,
      }));
      setEntries(normalised);
      setGeneratedAt(res.data.generatedAt ?? null);
      setCached(!!res.data.cached);
    } catch (e) {
      console.error('Leaderboard fetch error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard(type);
  }, [type]);

  const filtered = search.trim()
    ? entries.filter((e) =>
        e.username.toLowerCase().includes(search.toLowerCase()),
      )
    : entries.slice(0, 500);

  return (
    <div className="text-white">
      {/* HEADER */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2">
            <Trophy size={22} className="text-yellow-400" /> Leaderboard
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            {entries.length > 0
              ? `Top ${Math.min(entries.length, 500)} players`
              : 'No data yet'}
            {generatedAt && (
              <span className="ml-2 text-gray-600">
                · {cached ? 'Cached' : 'Live'} ·{' '}
                {new Date(generatedAt).toLocaleString()}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => fetchLeaderboard(type)}
          className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm font-semibold transition"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* TABS */}
      <div className="flex gap-2 mb-5">
        {(['weekly', 'monthly', 'all'] as const).map((val) => (
          <button
            key={val}
            onClick={() => setType(val)}
            className={`px-5 py-2 rounded-xl text-sm font-bold transition ${type === val ? 'bg-indigo-600' : 'bg-gray-800 hover:bg-gray-700'}`}
          >
            {val === 'weekly'
              ? '📅 Weekly'
              : val === 'monthly'
                ? '🗓️ Monthly'
                : '🏆 All-Time'}
          </button>
        ))}
      </div>

      {/* SEARCH */}
      <div className="mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Find a player by username…"
          className="w-full max-w-sm bg-gray-800 border border-gray-700 focus:border-indigo-500 rounded-lg px-4 py-2 text-sm outline-none transition"
        />
      </div>

      {/* TOP 3 PODIUM */}
      {!search && entries.length >= 3 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[entries[1], entries[0], entries[2]].map((e, i) => {
            const podiumRank = [2, 1, 3][i];
            const isTop = podiumRank === 1;
            return (
              <div
                key={e.userId}
                className={`bg-gray-900 border ${isTop ? 'border-yellow-400/40' : 'border-gray-800'} rounded-2xl p-5 flex flex-col items-center gap-2`}
              >
                <p className="text-3xl">{RANK_ICON(podiumRank)}</p>
                <AvatarCell avatar={e.avatar} username={e.username} />
                <p
                  className={`font-extrabold text-sm truncate max-w-full ${isTop ? 'text-yellow-300' : 'text-white'}`}
                >
                  {e.username}
                </p>
                <p className="text-gray-400 text-xs">
                  {e.score.toLocaleString()} pts
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* TABLE */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/80 text-gray-400 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left w-16">Rank</th>
              <th className="px-4 py-3 text-left">Player</th>
              <th className="px-4 py-3 text-right">Score</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={3} className="text-center py-16 text-gray-500">
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={3} className="text-center py-16 text-gray-500">
                  {search ? 'No player found' : 'No leaderboard data yet.'}
                </td>
              </tr>
            ) : (
              filtered.map((e) => (
                <tr
                  key={e.userId}
                  className={`border-t border-gray-800 transition ${e.rank <= 3 ? 'bg-yellow-400/5' : 'hover:bg-gray-800/30'}`}
                >
                  <td className="px-4 py-3">
                    <span className={`text-sm ${RANK_STYLE(e.rank)}`}>
                      {RANK_ICON(e.rank) ?? `#${e.rank}`}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <AvatarCell avatar={e.avatar} username={e.username} />
                      <span
                        className={`font-semibold ${e.rank <= 3 ? 'text-white' : 'text-gray-200'}`}
                      >
                        {e.username}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`font-bold tabular-nums ${e.rank === 1 ? 'text-yellow-400' : e.rank <= 3 ? 'text-white' : 'text-gray-300'}`}
                    >
                      {e.score.toLocaleString()}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {!search && entries.length > 500 && (
          <div className="px-4 py-3 border-t border-gray-800 text-center text-gray-500 text-xs">
            Showing top 500 of {entries.length.toLocaleString()} players
          </div>
        )}
      </div>
    </div>
  );
}
