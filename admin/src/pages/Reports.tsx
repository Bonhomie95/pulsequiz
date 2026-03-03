import { useEffect, useState } from 'react';
import { adminApi } from '../api/client';
import { Flag, RefreshCw, CheckCircle, Eye, AlertTriangle } from 'lucide-react';

type Report = {
  _id: string;
  reporterId: { username: string; email: string } | null;
  reportedUserId: { username: string; email: string; isBanned: boolean } | null;
  reason: string;
  details?: string;
  status: 'open' | 'resolved' | 'dismissed';
  action?: string;
  resolvedBy?: string;
  createdAt: string;
};

const STATUS_META: Record<string, { cls: string }> = {
  open:      { cls: 'bg-red-500/15 text-red-400 border-red-500/30' },
  resolved:  { cls: 'bg-green-500/15 text-green-400 border-green-500/30' },
  dismissed: { cls: 'bg-gray-500/15 text-gray-400 border-gray-500/30' },
};

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h3 className="font-bold text-lg">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition text-xl leading-none">&times;</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export default function Reports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('open');
  const [loading, setLoading] = useState(true);
  const [viewReport, setViewReport] = useState<Report | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (statusFilter) params.set('status', statusFilter);
      const res = await adminApi.get(`/admin/reports?${params}`);
      setReports(res.data.reports ?? []);
      setTotal(res.data.total ?? 0);
    } catch (e) {
      console.error('Reports fetch error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReports(); }, [page, statusFilter]);

  const resolve = async (id: string, action: 'resolved' | 'dismissed', banUser = false) => {
    const msg = banUser ? 'Resolve and BAN the reported user?' : `Mark this report as ${action}?`;
    if (!confirm(msg)) return;
    setResolving(id);
    try {
      await adminApi.patch(`/admin/reports/${id}`, { status: action, banUser });
      fetchReports();
      if (viewReport?._id === id) setViewReport(null);
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Error');
    } finally {
      setResolving(null);
    }
  };

  const openCount = reports.filter((r) => r.status === 'open').length;

  return (
    <div className="text-white">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2">
            <Flag size={22} className="text-red-400" /> Reports
            {openCount > 0 && <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{openCount} open</span>}
          </h1>
          <p className="text-gray-400 text-sm mt-1">User-submitted reports</p>
        </div>
        <button onClick={fetchReports} className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm font-semibold transition">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* INFO */}
      <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-4 mb-5 flex items-start gap-3">
        <AlertTriangle size={16} className="text-yellow-400 shrink-0 mt-0.5" />
        <p className="text-yellow-200 text-sm">
          Reports are submitted by users. Review each case carefully before taking action. Banning is permanent until manually reversed.
        </p>
      </div>

      {/* FILTERS */}
      <div className="flex gap-2 mb-5">
        {[['open', 'Open'], ['resolved', 'Resolved'], ['dismissed', 'Dismissed'], ['', 'All']].map(([val, label]) => (
          <button key={val} onClick={() => { setStatusFilter(val); setPage(1); }}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${statusFilter === val ? 'bg-indigo-600' : 'bg-gray-800 hover:bg-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* TABLE */}
      {loading ? (
        <div className="text-center py-16 text-gray-500">Loading…</div>
      ) : reports.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-16 text-center">
          <CheckCircle size={36} className="mx-auto mb-3 text-green-500 opacity-60" />
          <p className="text-gray-400">No {statusFilter} reports</p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-800/80 text-gray-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Reporter</th>
                <th className="px-4 py-3 text-left">Reported User</th>
                <th className="px-4 py-3 text-left">Reason</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => {
                const meta = STATUS_META[r.status] ?? STATUS_META.open;
                return (
                  <tr key={r._id} className={`border-t border-gray-800 hover:bg-gray-800/30 transition ${r.status !== 'open' ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-xs">{r.reporterId?.username ?? <span className="italic text-gray-500">deleted</span>}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-semibold flex items-center gap-1.5">
                          {r.reportedUserId?.username ?? <span className="italic text-gray-500">deleted</span>}
                          {r.reportedUserId?.isBanned && <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">BANNED</span>}
                        </p>
                        <p className="text-gray-500 text-xs">{r.reportedUserId?.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-yellow-300 text-xs max-w-[180px] truncate">{r.reason}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold border capitalize ${meta.cls}`}>{r.status}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{new Date(r.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => setViewReport(r)} className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition"><Eye size={13} /></button>
                        {r.status === 'open' && (
                          <>
                            <button onClick={() => resolve(r._id, 'resolved')} disabled={resolving === r._id}
                              className="px-2 py-1 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-md text-xs font-bold transition">
                              Resolve
                            </button>
                            <button onClick={() => resolve(r._id, 'resolved', true)} disabled={resolving === r._id}
                              className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-md text-xs font-bold transition">
                              Ban
                            </button>
                            <button onClick={() => resolve(r._id, 'dismissed')} disabled={resolving === r._id}
                              className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-400 rounded-md text-xs font-bold transition">
                              Dismiss
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {total > 25 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
              <span className="text-gray-400 text-sm">{total} reports</span>
              <div className="flex gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded bg-gray-800 disabled:opacity-40 text-sm">Prev</button>
                <button onClick={() => setPage((p) => p + 1)} disabled={page * 25 >= total} className="px-3 py-1 rounded bg-gray-800 disabled:opacity-40 text-sm">Next</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW DETAIL MODAL */}
      {viewReport && (
        <Modal title="Report Detail" onClose={() => setViewReport(null)}>
          <div className="space-y-3 text-sm">
            <div className="bg-gray-800 rounded-xl p-4">
              <p className="text-gray-400 text-xs mb-1">Reported User</p>
              <p className="font-bold">{viewReport.reportedUserId?.username ?? 'deleted'}</p>
              <p className="text-gray-500 text-xs">{viewReport.reportedUserId?.email}</p>
            </div>
            <div className="bg-gray-800 rounded-xl p-4">
              <p className="text-gray-400 text-xs mb-1">Reason</p>
              <p className="text-yellow-300 font-semibold">{viewReport.reason}</p>
            </div>
            {viewReport.details && (
              <div className="bg-gray-800 rounded-xl p-4">
                <p className="text-gray-400 text-xs mb-1">Details</p>
                <p className="text-gray-200 leading-relaxed">{viewReport.details}</p>
              </div>
            )}
            <p className="text-gray-500 text-xs">Reported {new Date(viewReport.createdAt).toLocaleString()} by @{viewReport.reporterId?.username ?? 'deleted'}</p>
            {viewReport.status === 'open' && (
              <div className="flex gap-2 pt-2">
                <button onClick={() => resolve(viewReport._id, 'dismissed')} className="flex-1 bg-gray-800 hover:bg-gray-700 py-2.5 rounded-xl font-bold text-sm transition">Dismiss</button>
                <button onClick={() => resolve(viewReport._id, 'resolved')} className="flex-1 bg-green-600 hover:bg-green-500 py-2.5 rounded-xl font-bold text-sm transition">Resolve</button>
                <button onClick={() => resolve(viewReport._id, 'resolved', true)} className="flex-1 bg-red-600 hover:bg-red-500 py-2.5 rounded-xl font-bold text-sm transition">Ban User</button>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
