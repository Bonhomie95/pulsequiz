import { useEffect, useRef, useState } from 'react';
import { adminApi } from '../api/client';
import {
  Search,
  RefreshCw,
  Eye,
  Edit3,
  Ban,
  Trash2,
  CheckCircle,
  XCircle,
  Coins,
  Star,
} from 'lucide-react';

type User = {
  _id: string;
  username: string;
  email: string;
  isBanned: boolean;
  isPremium: boolean;
  coins: number;
  level?: number;
  streak?: number;
  lastSeenAt?: string;
  createdAt: string;
  usdtAddress?: string;
  withdrawalEnabled: boolean;
  premiumExpiresAt?: string;
};

type Pagination = { page: number; pages: number; total: number };

function isOnline(lastSeenAt?: string) {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < 5 * 60 * 1000;
}

function StatusBadge({ user }: { user: User }) {
  if (user.isBanned)
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-500/20 text-red-400">
        Banned
      </span>
    );
  if (user.isPremium)
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-yellow-400/20 text-yellow-300 flex items-center gap-1">
        <Star size={9} />
        Premium
      </span>
    );
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-green-500/20 text-green-400">
      Active
    </span>
  );
}

function OnlineDot({ lastSeenAt }: { lastSeenAt?: string }) {
  const online = isOnline(lastSeenAt);
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold ${online ? 'text-green-400' : 'text-gray-600'}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-green-400' : 'bg-gray-600'}`}
      />
      {online ? 'Online' : 'Offline'}
    </span>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h3 className="font-bold text-lg">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition text-xl leading-none"
          >
            &times;
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
      <span className="text-gray-400 text-sm">{label}</span>
      <span className="text-sm font-semibold text-right max-w-[60%] break-all">
        {value}
      </span>
    </div>
  );
}

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pages: 1,
    total: 0,
  });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [viewUser, setViewUser] = useState<User | null>(null);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [editFields, setEditFields] = useState({ username: '', coins: 0 });
  const [saving, setSaving] = useState(false);
  const [banning, setBanning] = useState<string | null>(null);

  const fetchUsers = async (overrideSearch?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      const q = overrideSearch ?? search;
      if (q) params.set('search', q);
      if (filter) params.set('filter', filter);
      const res = await adminApi.get(`/admin/users?${params}`);
      setUsers(res.data.users ?? []);
      // server returns { total, page, pages } at top level
      setPagination({
        total: res.data.total ?? 0,
        page: res.data.page ?? 1,
        pages: res.data.pages ?? 1,
      });
    } catch (e) {
      console.error('Error fetching users', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [page, filter]);

  // Live search: fire when 0 chars (cleared) or 3+ chars, debounced 300ms
  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.length === 0 || val.length >= 3) {
      debounceRef.current = setTimeout(() => {
        setPage(1);
        fetchUsers(val);
      }, 300);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setPage(1);
    fetchUsers(search);
  };

  const toggleBan = async (user: User) => {
    const msg = user.isBanned
      ? `Unban @${user.username}?`
      : `Ban @${user.username}? This will disable their withdrawals.`;
    if (!confirm(msg)) return;
    setBanning(user._id);
    try {
      await adminApi.patch(`/admin/users/${user._id}/ban`);
      fetchUsers();
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Error');
    } finally {
      setBanning(null);
    }
  };

  const openEdit = (u: User) => {
    setEditUser(u);
    setEditFields({ username: u.username, coins: u.coins });
  };

  const saveEdit = async () => {
    if (!editUser) return;
    setSaving(true);
    try {
      await adminApi.patch(`/admin/users/${editUser._id}`, editFields);
      setEditUser(null);
      fetchUsers();
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Error saving');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteUser) return;
    setSaving(true);
    try {
      await adminApi.delete(`/admin/users/${deleteUser._id}`);
      setDeleteUser(null);
      fetchUsers();
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Error deleting');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="text-white">
      {/* HEADER */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold">Users</h1>
          <p className="text-gray-400 text-sm mt-1">
            {pagination.total.toLocaleString()} total users
          </p>
        </div>
        <button
          onClick={() => fetchUsers()}
          className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm font-semibold transition"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* SEARCH + FILTERS */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <form
          onSubmit={handleSearchSubmit}
          className="flex gap-2 flex-1 min-w-[200px]"
        >
          <div className="relative flex-1">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
            />
            <input
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search username or email… (live after 3 chars)"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:border-indigo-500 transition"
            />
          </div>
          <button
            type="submit"
            className="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-lg text-sm font-semibold transition"
          >
            Search
          </button>
        </form>
        <div className="flex gap-2">
          {[
            ['', 'All'],
            ['banned', 'Banned'],
            ['premium', 'Premium'],
            ['online', 'Online'],
          ].map(([val, label]) => (
            <button
              key={val}
              onClick={() => {
                setFilter(val);
                setPage(1);
              }}
              className={`px-3 py-2 rounded-lg text-sm font-semibold transition ${filter === val ? 'bg-indigo-600' : 'bg-gray-800 hover:bg-gray-700'}`}
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
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Premium</th>
              <th className="px-4 py-3 text-left">Coins</th>
              <th className="px-4 py-3 text-left">Online</th>
              <th className="px-4 py-3 text-left">Joined</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="text-center py-14 text-gray-500">
                  Loading…
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-14 text-gray-500">
                  No users found
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr
                  key={u._id}
                  className="border-t border-gray-800 hover:bg-gray-800/40 transition"
                >
                  <td className="px-4 py-3">
                    <p className="font-bold">{u.username}</p>
                    <p className="text-gray-500 text-xs">{u.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge user={u} />
                  </td>
                  <td className="px-4 py-3">
                    {u.isPremium ? (
                      <span className="flex items-center gap-1 text-yellow-300 text-xs font-bold">
                        <Star size={11} />
                        PRO
                      </span>
                    ) : (
                      <span className="text-gray-600 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1 text-yellow-400 font-bold">
                      <Coins size={13} />
                      {u.coins.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <OnlineDot lastSeenAt={u.lastSeenAt} />
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => setViewUser(u)}
                        title="View details"
                        className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        onClick={() => openEdit(u)}
                        title="Edit user"
                        className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={() => toggleBan(u)}
                        disabled={banning === u._id}
                        title={u.isBanned ? 'Unban' : 'Ban'}
                        className={`p-1.5 rounded-lg transition ${u.isBanned ? 'bg-green-500/10 hover:bg-green-500/20 text-green-400' : 'bg-red-500/10 hover:bg-red-500/20 text-red-400'}`}
                      >
                        {u.isBanned ? (
                          <CheckCircle size={14} />
                        ) : (
                          <Ban size={14} />
                        )}
                      </button>
                      <button
                        onClick={() => setDeleteUser(u)}
                        title="Delete account"
                        className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {pagination.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
            <span className="text-gray-400 text-sm">
              {pagination.total} users · Page {pagination.page} of{' '}
              {pagination.pages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 rounded bg-gray-800 disabled:opacity-40 text-sm"
              >
                Prev
              </button>
              <button
                onClick={() =>
                  setPage((p) => Math.min(pagination.pages, p + 1))
                }
                disabled={page >= pagination.pages}
                className="px-3 py-1 rounded bg-gray-800 disabled:opacity-40 text-sm"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* VIEW MODAL */}
      {viewUser && (
        <Modal
          title={`@${viewUser.username}`}
          onClose={() => setViewUser(null)}
        >
          <Row label="Email" value={viewUser.email} />
          <Row label="Status" value={<StatusBadge user={viewUser} />} />
          <Row
            label="Coins"
            value={
              <span className="text-yellow-400">
                {viewUser.coins.toLocaleString()}
              </span>
            }
          />
          <Row
            label="Premium"
            value={
              viewUser.isPremium ? (
                <span className="text-yellow-300 font-bold">✓ Active</span>
              ) : (
                <span className="text-gray-500">No</span>
              )
            }
          />
          {viewUser.isPremium && (
            <Row
              label="Premium Expires"
              value={
                viewUser.premiumExpiresAt
                  ? new Date(viewUser.premiumExpiresAt).toLocaleDateString()
                  : '—'
              }
            />
          )}
          <Row
            label="Withdrawals"
            value={
              viewUser.withdrawalEnabled ? (
                <span className="text-green-400">Enabled</span>
              ) : (
                <span className="text-red-400">Disabled</span>
              )
            }
          />
          {viewUser.usdtAddress && (
            <Row label="USDT Address" value={viewUser.usdtAddress} />
          )}
          <Row
            label="Joined"
            value={new Date(viewUser.createdAt).toLocaleDateString()}
          />
          <Row
            label="Last Seen"
            value={
              viewUser.lastSeenAt
                ? new Date(viewUser.lastSeenAt).toLocaleString()
                : 'Never'
            }
          />
        </Modal>
      )}

      {/* EDIT MODAL */}
      {editUser && (
        <Modal
          title={`Edit @${editUser.username}`}
          onClose={() => setEditUser(null)}
        >
          <div className="space-y-4">
            <div>
              <label className="text-xs text-gray-400 block mb-1">
                Username
              </label>
              <input
                value={editFields.username}
                onChange={(e) =>
                  setEditFields((f) => ({ ...f, username: e.target.value }))
                }
                className="w-full bg-gray-800 border border-gray-700 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm outline-none transition"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">
                Coin Balance (direct override)
              </label>
              <input
                type="number"
                min={0}
                value={editFields.coins}
                onChange={(e) =>
                  setEditFields((f) => ({
                    ...f,
                    coins: Number(e.target.value),
                  }))
                }
                className="w-full bg-gray-800 border border-gray-700 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm outline-none transition"
              />
            </div>
            <button
              onClick={saveEdit}
              disabled={saving}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 py-2.5 rounded-xl font-bold text-sm transition"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </Modal>
      )}

      {/* DELETE MODAL */}
      {deleteUser && (
        <Modal title="Delete Account?" onClose={() => setDeleteUser(null)}>
          <div className="text-center py-2">
            <XCircle size={40} className="mx-auto mb-4 text-red-400" />
            <p className="text-gray-300 mb-2">
              You are about to permanently delete
            </p>
            <p className="font-bold text-lg mb-4">@{deleteUser.username}</p>
            <p className="text-gray-500 text-sm mb-6">
              This will delete their wallet and subscription. Purchases and quiz
              sessions are preserved for audit.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteUser(null)}
                className="flex-1 bg-gray-800 hover:bg-gray-700 py-2.5 rounded-xl font-bold text-sm transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={saving}
                className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 py-2.5 rounded-xl font-bold text-sm transition"
              >
                {saving ? 'Deleting…' : 'Delete Account'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
