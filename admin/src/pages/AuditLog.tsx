import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../api/client';
import { useAdminRole } from '../auth/useAdminRole';

type AuditEntry = {
  _id: string;
  adminEmail: string;
  adminRole: string;
  action: string;
  targetType?: string;
  targetId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  createdAt: string;
};

/** Actions worth colouring, because they move money or destroy data. */
const HIGH_IMPACT = new Set([
  'payout.trigger',
  'payout.retry',
  'prizepool.set',
  'user.adjust_coins',
  'user.delete',
  'settings.update',
  'settings.bulk_update',
]);

export default function AuditLog() {
  const { canViewAudit } = useAdminRole();

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.get('/admin/audit', {
        params: { page, limit: 50, ...(action ? { action } : {}) },
      });
      setEntries(res.data.entries ?? []);
      setTotal(res.data.total ?? 0);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Could not load the audit trail.');
    } finally {
      setLoading(false);
    }
  }, [page, action]);

  useEffect(() => {
    if (canViewAudit) load();
  }, [load, canViewAudit]);

  if (!canViewAudit) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-2">Audit log</h1>
        <p className="text-gray-400">
          Only SUPER_ADMIN accounts can read the audit trail.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-baseline justify-between mb-1">
        <h1 className="text-2xl font-bold">Audit log</h1>
        <span className="text-sm text-gray-400">{total} entries</span>
      </div>
      <p className="text-gray-400 mb-5 text-sm">
        Every mutating admin action — who did it, to what, and what changed.
      </p>

      <div className="flex gap-2 mb-4">
        <select
          value={action}
          onChange={(e) => {
            setPage(1);
            setAction(e.target.value);
          }}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
        >
          <option value="">All actions</option>
          {[
            'payout.trigger',
            'payout.retry',
            'prizepool.set',
            'user.adjust_coins',
            'user.ban',
            'user.unban',
            'user.update',
            'user.delete',
            'settings.update',
            'settings.bulk_update',
          ].map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <button
          onClick={load}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm hover:bg-gray-700"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-800 bg-red-950/40 p-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-gray-400">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-gray-400">No admin actions recorded yet.</p>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-900 text-gray-400 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Admin</th>
                <th className="px-4 py-2 font-medium">Action</th>
                <th className="px-4 py-2 font-medium">Target</th>
                <th className="px-4 py-2 font-medium">Changes</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e._id} className="border-t border-gray-800 align-top">
                  <td className="px-4 py-2 whitespace-nowrap text-gray-400">
                    {new Date(e.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2">
                    <div>{e.adminEmail}</div>
                    <div className="text-xs text-gray-500">{e.adminRole}</div>
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-semibold ${
                        HIGH_IMPACT.has(e.action)
                          ? 'bg-amber-900/50 text-amber-300'
                          : 'bg-gray-800 text-gray-300'
                      }`}
                    >
                      {e.action}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-400 font-mono text-xs">
                    {e.targetType ? `${e.targetType}:${e.targetId ?? '—'}` : '—'}
                  </td>
                  <td className="px-4 py-2">
                    {e.before === undefined && e.after === undefined ? (
                      <span className="text-gray-600">—</span>
                    ) : (
                      <button
                        onClick={() => setExpanded(expanded === e._id ? null : e._id)}
                        className="text-indigo-400 hover:underline text-xs"
                      >
                        {expanded === e._id ? 'Hide' : 'View'}
                      </button>
                    )}
                    {expanded === e._id && (
                      <pre className="mt-2 max-w-lg overflow-x-auto rounded bg-gray-950 p-2 text-xs text-gray-300">
                        {JSON.stringify({ before: e.before, after: e.after }, null, 2)}
                      </pre>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
          className="px-3 py-1.5 bg-gray-800 rounded text-sm disabled:opacity-40"
        >
          Previous
        </button>
        <span className="text-sm text-gray-400">Page {page}</span>
        <button
          disabled={entries.length < 50}
          onClick={() => setPage((p) => p + 1)}
          className="px-3 py-1.5 bg-gray-800 rounded text-sm disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
