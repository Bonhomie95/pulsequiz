import { useEffect, useState } from 'react';
import { adminApi } from '../api/client';
import { Trophy, Plus, RefreshCw, Edit3, Trash2, X } from 'lucide-react';

type Tournament = {
  _id: string;
  title: string;
  description?: string;
  category: string;
  entryFee: number;
  prizePool: number;
  maxParticipants: number;
  participants: number;
  status: 'upcoming' | 'active' | 'completed' | 'cancelled';
  startsAt: string;
  endsAt: string;
  createdAt: string;
};

type TournamentForm = {
  title: string;
  description: string;
  category: string;
  entryFee: number;
  prizePool: number;
  maxParticipants: number;
  startsAt: string;
  endsAt: string;
};

const EMPTY_FORM: TournamentForm = {
  title: '', description: '', category: 'General Knowledge',
  entryFee: 100, prizePool: 1000, maxParticipants: 100,
  startsAt: '', endsAt: '',
};

const STATUS_META: Record<string, { cls: string; label: string }> = {
  upcoming:  { cls: 'bg-blue-500/15 text-blue-400',   label: 'Upcoming' },
  active:    { cls: 'bg-green-500/15 text-green-400',  label: 'Active' },
  completed: { cls: 'bg-gray-500/15 text-gray-400',    label: 'Completed' },
  cancelled: { cls: 'bg-red-500/15 text-red-400',      label: 'Cancelled' },
};

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h3 className="font-bold text-lg">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-white transition"><X size={16} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function TournamentForm({ form, setForm, onSave, saving, submitLabel }: {
  form: TournamentForm;
  setForm: React.Dispatch<React.SetStateAction<TournamentForm>>;
  onSave: () => void;
  saving: boolean;
  submitLabel: string;
}) {
  const set = (k: keyof TournamentForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'number' ? Number(e.target.value) : e.target.value }));

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-gray-400 block mb-1">Title</label>
        <input value={form.title} onChange={set('title')} placeholder="Tournament title"
          className="w-full bg-gray-800 border border-gray-700 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm outline-none" />
      </div>
      <div>
        <label className="text-xs text-gray-400 block mb-1">Description</label>
        <textarea value={form.description} onChange={set('description')} rows={2} placeholder="Optional description"
          className="w-full bg-gray-800 border border-gray-700 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm outline-none resize-none" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-400 block mb-1">Category</label>
          <input value={form.category} onChange={set('category')} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none" />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Max Participants</label>
          <input type="number" min={2} value={form.maxParticipants} onChange={set('maxParticipants')}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none" />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Entry Fee (coins)</label>
          <input type="number" min={0} value={form.entryFee} onChange={set('entryFee')}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none" />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Prize Pool (coins)</label>
          <input type="number" min={0} value={form.prizePool} onChange={set('prizePool')}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none" />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Starts At</label>
          <input type="datetime-local" value={form.startsAt} onChange={set('startsAt')}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none" />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Ends At</label>
          <input type="datetime-local" value={form.endsAt} onChange={set('endsAt')}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none" />
        </div>
      </div>
      <button onClick={onSave} disabled={saving || !form.title || !form.startsAt || !form.endsAt}
        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 py-2.5 rounded-xl font-bold text-sm transition mt-2">
        {saving ? 'Saving…' : submitLabel}
      </button>
    </div>
  );
}

export default function Tournaments() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [editT, setEditT] = useState<Tournament | null>(null);
  const [createForm, setCreateForm] = useState<TournamentForm>({ ...EMPTY_FORM });
  const [editForm, setEditForm] = useState<TournamentForm>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const fetchTournaments = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (statusFilter) params.set('status', statusFilter);
      const res = await adminApi.get(`/admin/tournaments?${params}`);
      setTournaments(res.data.tournaments ?? []);
      setTotal(res.data.total ?? 0);
    } catch (e) {
      console.error('Tournaments fetch error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTournaments(); }, [page, statusFilter]);

  const createTournament = async () => {
    setSaving(true);
    try {
      await adminApi.post('/admin/tournaments', createForm);
      setShowCreate(false);
      setCreateForm({ ...EMPTY_FORM });
      fetchTournaments();
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Error creating tournament');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (t: Tournament) => {
    setEditT(t);
    setEditForm({
      title: t.title, description: t.description ?? '',
      category: t.category, entryFee: t.entryFee, prizePool: t.prizePool,
      maxParticipants: t.maxParticipants,
      startsAt: t.startsAt ? new Date(t.startsAt).toISOString().slice(0, 16) : '',
      endsAt: t.endsAt ? new Date(t.endsAt).toISOString().slice(0, 16) : '',
    });
  };

  const saveEdit = async () => {
    if (!editT) return;
    setSaving(true);
    try {
      await adminApi.patch(`/admin/tournaments/${editT._id}`, editForm);
      setEditT(null);
      fetchTournaments();
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Error updating');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (id: string, status: string) => {
    if (!confirm(`Set tournament status to "${status}"?`)) return;
    try {
      await adminApi.patch(`/admin/tournaments/${id}`, { status });
      fetchTournaments();
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Error');
    }
  };

  const deleteTournament = async (id: string, title: string) => {
    if (!confirm(`Delete tournament "${title}"? This is irreversible.`)) return;
    try {
      await adminApi.delete(`/admin/tournaments/${id}`);
      fetchTournaments();
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Error deleting');
    }
  };

  return (
    <div className="text-white">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2"><Trophy size={22} className="text-yellow-400" /> Tournaments</h1>
          <p className="text-gray-400 text-sm mt-1">{total} tournaments</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchTournaments} className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm font-semibold transition">
            <RefreshCw size={14} />
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-lg text-sm font-semibold transition">
            <Plus size={15} /> New Tournament
          </button>
        </div>
      </div>

      {/* STATUS FILTERS */}
      <div className="flex gap-2 mb-5">
        {[['', 'All'], ['upcoming', 'Upcoming'], ['active', 'Active'], ['completed', 'Completed'], ['cancelled', 'Cancelled']].map(([val, label]) => (
          <button key={val} onClick={() => { setStatusFilter(val); setPage(1); }}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${statusFilter === val ? 'bg-indigo-600' : 'bg-gray-800 hover:bg-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* CARDS */}
      {loading ? (
        <div className="text-center py-16 text-gray-500">Loading…</div>
      ) : tournaments.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-16 text-center">
          <Trophy size={36} className="mx-auto mb-3 opacity-20" />
          <p className="text-gray-400">No tournaments yet</p>
          <button onClick={() => setShowCreate(true)} className="mt-4 bg-indigo-600 hover:bg-indigo-500 px-5 py-2 rounded-lg text-sm font-bold transition">
            Create First Tournament
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {tournaments.map((t) => {
            const meta = STATUS_META[t.status] ?? STATUS_META.upcoming;
            const pct = t.maxParticipants > 0 ? Math.min(100, (t.participants / t.maxParticipants) * 100) : 0;
            return (
              <div key={t._id} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 hover:border-gray-700 transition">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-bold text-base truncate">{t.title}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${meta.cls}`}>{meta.label}</span>
                    </div>
                    <p className="text-gray-500 text-xs">{t.category}</p>
                  </div>
                  <div className="flex gap-1 ml-2 shrink-0">
                    <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition"><Edit3 size={13} /></button>
                    <button onClick={() => deleteTournament(t._id, t.title)} className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition"><Trash2 size={13} /></button>
                  </div>
                </div>

                {t.description && <p className="text-gray-400 text-xs mb-3 line-clamp-2">{t.description}</p>}

                <div className="grid grid-cols-3 gap-3 text-center mb-3">
                  <div className="bg-gray-800 rounded-xl p-2">
                    <p className="text-yellow-400 font-bold text-sm">{t.entryFee.toLocaleString()}</p>
                    <p className="text-gray-500 text-[10px]">Entry</p>
                  </div>
                  <div className="bg-gray-800 rounded-xl p-2">
                    <p className="text-green-400 font-bold text-sm">{t.prizePool.toLocaleString()}</p>
                    <p className="text-gray-500 text-[10px]">Prize Pool</p>
                  </div>
                  <div className="bg-gray-800 rounded-xl p-2">
                    <p className="text-white font-bold text-sm">{t.participants}/{t.maxParticipants}</p>
                    <p className="text-gray-500 text-[10px]">Players</p>
                  </div>
                </div>

                {/* Participant bar */}
                <div className="mb-3">
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-gray-500 text-[10px] mt-1">{pct.toFixed(0)}% full</p>
                </div>

                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{new Date(t.startsAt).toLocaleDateString()} → {new Date(t.endsAt).toLocaleDateString()}</span>
                  {t.status === 'upcoming' && (
                    <button onClick={() => changeStatus(t._id, 'active')}
                      className="px-2 py-1 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-md font-bold transition">
                      Start
                    </button>
                  )}
                  {t.status === 'active' && (
                    <button onClick={() => changeStatus(t._id, 'completed')}
                      className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-md font-bold transition">
                      End
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {total > 20 && (
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-4 py-2 rounded-lg bg-gray-800 disabled:opacity-40 text-sm">Prev</button>
          <button onClick={() => setPage((p) => p + 1)} disabled={page * 20 >= total} className="px-4 py-2 rounded-lg bg-gray-800 disabled:opacity-40 text-sm">Next</button>
        </div>
      )}

      {showCreate && (
        <Modal title="New Tournament" onClose={() => setShowCreate(false)}>
          <TournamentForm form={createForm} setForm={setCreateForm} onSave={createTournament} saving={saving} submitLabel="Create Tournament" />
        </Modal>
      )}

      {editT && (
        <Modal title={`Edit: ${editT.title}`} onClose={() => setEditT(null)}>
          <TournamentForm form={editForm} setForm={setEditForm} onSave={saveEdit} saving={saving} submitLabel="Save Changes" />
        </Modal>
      )}
    </div>
  );
}
