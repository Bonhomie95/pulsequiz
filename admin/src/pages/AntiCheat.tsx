import { useEffect, useState } from 'react';
import { adminApi } from '../api/client';
import {
  Shield,
  AlertTriangle,
  CheckCircle,
  Ban,
  Eye,
  RefreshCw,
} from 'lucide-react';

type FlaggedUser = {
  _id: string;
  userId: {
    _id: string;
    username: string;
    email: string;
    isBanned: boolean;
    createdAt: string;
  } | null;
  reason: string;
  accuracyRate?: number;
  sessionVelocity?: number;
  fastAnswerCount?: number;
  flaggedAt: string;
  resolved: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
  action?: 'warned' | 'banned' | 'cleared';
};

const ACTION_STYLES: Record<string, string> = {
  warned: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  banned: 'bg-red-500/20 text-red-400 border-red-500/30',
  cleared: 'bg-green-500/20 text-green-400 border-green-500/30',
};

export default function AntiCheat() {
  const [accounts, setAccounts] = useState<FlaggedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unresolved' | 'resolved'>(
    'unresolved',
  );
  const [resolving, setResolving] = useState<string | null>(null);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const params =
        filter === 'all' ? '' : `?resolved=${filter === 'resolved'}`;
      const res = await adminApi.get(`/admin/anticheat${params}`);
      setAccounts(res.data.accounts ?? []);
    } catch {
      console.error('Error fetching flagged accounts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, [filter]);

  const resolve = async (
    id: string,
    action: 'warned' | 'banned' | 'cleared',
  ) => {
    const confirmMessages = {
      warned: 'Send a warning to this user? (Account not banned)',
      banned: '⛔ BAN this account? This will disable their withdrawals.',
      cleared: 'Mark this flag as cleared (false positive)?',
    };
    if (!confirm(confirmMessages[action])) return;

    setResolving(id);
    try {
      await adminApi.post(`/admin/anticheat/${id}/resolve`, { action });
      fetchAccounts();
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Error resolving flag');
    } finally {
      setResolving(null);
    }
  };

  const unresolved = accounts.filter((a) => !a.resolved).length;

  return (
    <div className="text-white">
      {/* HEADER */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-3">
            <Shield size={24} className="text-red-400" />
            Anti-Cheat
            {unresolved > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {unresolved} open
              </span>
            )}
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Review flagged accounts and take action before payouts
          </p>
        </div>
        <button
          onClick={fetchAccounts}
          className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm font-semibold transition"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* INFO BOX */}
      <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-4 mb-5 flex items-start gap-3">
        <AlertTriangle size={18} className="text-yellow-400 shrink-0 mt-0.5" />
        <div className="text-sm text-yellow-200">
          <p className="font-bold mb-1">Review before payouts</p>
          <p className="text-yellow-300/80">
            Flagged accounts are <strong>not automatically banned</strong>.
            Review each flag and take action. Banned accounts are excluded from
            all USDT payouts automatically.
          </p>
        </div>
      </div>

      {/* FILTER TABS */}
      <div className="flex gap-2 mb-5">
        {(['unresolved', 'resolved', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold capitalize transition ${filter === f ? 'bg-indigo-600' : 'bg-gray-800 hover:bg-gray-700'}`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* TABLE */}
      {loading ? (
        <div className="text-center py-16 text-gray-500">Loading…</div>
      ) : accounts.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-16 text-center">
          <CheckCircle size={36} className="mx-auto mb-3 text-green-500" />
          <p className="text-gray-400 font-semibold">No flagged accounts</p>
          <p className="text-gray-600 text-sm mt-1">
            The system will flag suspicious activity automatically
          </p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-800 text-gray-400">
              <tr>
                <th className="px-4 py-3 text-left">User</th>
                <th className="px-4 py-3 text-left">Flag Reason</th>
                <th className="px-4 py-3 text-left">Stats</th>
                <th className="px-4 py-3 text-left">Flagged</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => {
                const user = a.userId;
                const isBanned = user?.isBanned ?? false;
                return (
                  <tr
                    key={a._id}
                    className={`border-t border-gray-800 transition ${!a.resolved ? 'hover:bg-gray-800/50' : 'opacity-60'}`}
                  >
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-bold flex items-center gap-2">
                          {user?.username ?? (
                            <span className="text-gray-500 italic">
                              deleted
                            </span>
                          )}
                          {isBanned && (
                            <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">
                              BANNED
                            </span>
                          )}
                        </p>
                        <p className="text-gray-500 text-xs">
                          {user?.email ?? '—'}
                        </p>
                      </div>
                    </td>

                    <td className="px-4 py-3 max-w-xs">
                      <p className="text-yellow-300 text-xs leading-relaxed">
                        {a.reason}
                      </p>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5 text-xs">
                        {a.accuracyRate != null && (
                          <span className="text-orange-400">
                            Accuracy: {(a.accuracyRate * 100).toFixed(1)}%
                          </span>
                        )}
                        {a.sessionVelocity != null && (
                          <span className="text-orange-400">
                            Sessions/24h: {a.sessionVelocity}
                          </span>
                        )}
                        {a.fastAnswerCount != null && (
                          <span className="text-orange-400">
                            Fast answers: {a.fastAnswerCount}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {new Date(a.flaggedAt).toLocaleDateString()}
                    </td>

                    <td className="px-4 py-3">
                      {a.resolved && a.action ? (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border capitalize ${ACTION_STYLES[a.action]}`}
                        >
                          {a.action === 'banned' ? (
                            <Ban size={10} />
                          ) : a.action === 'cleared' ? (
                            <CheckCircle size={10} />
                          ) : (
                            <Eye size={10} />
                          )}
                          {a.action}
                        </span>
                      ) : (
                        <span className="text-xs text-yellow-400 font-semibold flex items-center gap-1">
                          <AlertTriangle size={11} /> Pending review
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      {!a.resolved && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => resolve(a._id, 'cleared')}
                            disabled={resolving === a._id}
                            title="Mark as false positive"
                            className="px-2 py-1 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-md text-xs font-bold transition"
                          >
                            Clear
                          </button>
                          <button
                            onClick={() => resolve(a._id, 'warned')}
                            disabled={resolving === a._id}
                            title="Warn user"
                            className="px-2 py-1 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 rounded-md text-xs font-bold transition"
                          >
                            Warn
                          </button>
                          <button
                            onClick={() => resolve(a._id, 'banned')}
                            disabled={resolving === a._id || isBanned}
                            title="Ban account"
                            className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-md text-xs font-bold transition disabled:opacity-40"
                          >
                            Ban
                          </button>
                        </div>
                      )}
                      {a.resolved && a.resolvedBy && (
                        <p className="text-gray-600 text-xs">
                          by {a.resolvedBy}
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
