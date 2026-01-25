import { useEffect, useState } from 'react';
import { adminApi } from '../api/client';

type User = {
  _id: string;
  username: string;
  email: string;
  coins: number;
  level: number;
  isBanned: boolean;
  lastSeenAt: string | null;
  createdAt: string;
};

const PAGE_SIZE = 20;

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 10000); // update every 10s

    return () => clearInterval(interval);
  }, []);

  /* 🔹 Fetch users */
  useEffect(() => {
    let active = true;

    const fetchUsers = async () => {
      const res = await adminApi.get('/admin/users', {
        params: { search, page },
      });

      if (active) {
        setUsers(res.data.users);
        setTotal(res.data.total);
      }
    };

    fetchUsers();

    return () => {
      active = false;
    };
  }, [search, page]);

  const toggleBan = async (id: string) => {
    await adminApi.patch(`/admin/users/${id}/ban`);
    const res = await adminApi.get('/admin/users', {
      params: { search, page },
    });
    setUsers(res.data.users);
  };

  const isOnline = (lastSeenAt: string | null) => {
    if (!lastSeenAt) return false;
    return now - new Date(lastSeenAt).getTime() < 2 * 60 * 1000;
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Users</h1>

      <input
        placeholder="Search username..."
        value={search}
        onChange={(e) => {
          setPage(1);
          setSearch(e.target.value);
        }}
        className="bg-gray-900 border border-gray-700 px-4 py-2 rounded-lg w-full"
      />

      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800 text-gray-400">
            <tr>
              <th className="p-3 text-left">User</th>
              <th>Coins</th>
              <th>Level</th>
              <th>Status</th>
              <th>Online</th>
              <th>Joined</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u._id} className="border-t border-gray-800">
                <td className="p-3">
                  <div className="font-semibold">{u.username}</div>
                  <div className="text-gray-500 text-xs">{u.email}</div>
                </td>
                <td>{u.coins}</td>
                <td>{u.level}</td>
                <td>
                  {u.isBanned ? (
                    <span className="text-red-400">Banned</span>
                  ) : (
                    <span className="text-green-400">Active</span>
                  )}
                </td>
                <td>
                  {isOnline(u.lastSeenAt) ? (
                    <span className="text-green-400">● Online</span>
                  ) : (
                    <span className="text-gray-500">Offline</span>
                  )}
                </td>
                <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                <td>
                  <button
                    onClick={() => toggleBan(u._id)}
                    className={`px-3 py-1 rounded ${
                      u.isBanned
                        ? 'bg-green-600 hover:bg-green-700'
                        : 'bg-red-600 hover:bg-red-700'
                    }`}
                  >
                    {u.isBanned ? 'Unban' : 'Ban'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 🔹 Pagination */}
      <div className="flex justify-between items-center">
        <button
          disabled={page === 1}
          onClick={() => setPage((p) => p - 1)}
          className="px-4 py-2 bg-gray-800 rounded disabled:opacity-30"
        >
          Previous
        </button>

        <span className="text-gray-400">
          Page {page} of {totalPages}
        </span>

        <button
          disabled={page === totalPages}
          onClick={() => setPage((p) => p + 1)}
          className="px-4 py-2 bg-gray-800 rounded disabled:opacity-30"
        >
          Next
        </button>
      </div>
    </div>
  );
}
