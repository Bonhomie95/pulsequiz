import {
  Users,
  Coins,
  CreditCard,
  AlertTriangle,
  TrendingUp,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { adminApi } from '../api/client';
import {ActivityItem} from '../types/activity';

type StatCardProps = {
  title: string;
  value: string;
  icon: React.ReactNode;
  change?: string;
  positive?: boolean;
};

function StatCard({ title, value, icon, change, positive }: StatCardProps) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex flex-col justify-between hover:border-indigo-600 transition">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-400">{title}</span>
        <div className="p-2 rounded-lg bg-gray-800">{icon}</div>
      </div>

      <div className="mt-4">
        <div className="text-2xl font-extrabold">{value}</div>

        {change && (
          <div
            className={`flex items-center gap-1 text-xs mt-1 ${
              positive ? 'text-green-400' : 'text-red-400'
            }`}
          >
            <TrendingUp size={12} />
            {change}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState({
    users: 0,
    coins: 0,
    purchases: 0,
    flags: 0,
  });

  const [activity, setActivity] = useState<ActivityItem[]>([]);

  useEffect(() => {
    adminApi.get('/admin/activity').then((res) => setActivity(res.data));
  }, []);

  useEffect(() => {
    async function load() {
      const [u, c, p, f] = await Promise.all([
        adminApi.get('/admin/stats/users'),
        adminApi.get('/admin/stats/coins'),
        adminApi.get('/admin/stats/purchases-today'),
        adminApi.get('/admin/stats/flags'),
      ]);

      setStats({
        users: u.data.total,
        coins: c.data.total,
        purchases: p.data.total,
        flags: f.data.total,
      });
    }

    load();
  }, []);

  useEffect(() => {
    const fetchActivity = async () => {
      const res = await adminApi.get<ActivityItem[]>('/admin/activity');
      setActivity(res.data);
    };

    fetchActivity();

    const interval = setInterval(fetchActivity, 5000); // every 5s

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold">Dashboard Overview</h1>
        <p className="text-gray-400 text-sm">
          Monitor platform health and activity
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Users"
          value={stats.users.toLocaleString()}
          icon={<Users size={20} />}
          change="+5.2% this week"
          positive
        />

        <StatCard
          title="Coins Circulating"
          value={stats.coins.toLocaleString()}
          icon={<Coins size={20} />}
          change="+12% growth"
          positive
        />

        <StatCard
          title="Purchases Today"
          value={stats.purchases.toString()}
          icon={<CreditCard size={20} />}
          change="+3.1%"
          positive
        />

        <StatCard
          title="Reports / Flags"
          value={stats.flags.toString()}
          icon={<AlertTriangle size={20} />}
          change="-8% vs yesterday"
          positive={false}
        />
      </div>

      {/* Activity Panel */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <h2 className="font-bold mb-4">Recent Activity</h2>

        <div className="space-y-2 text-sm">
          {activity.map((a) => (
            <div key={a._id} className="flex justify-between text-gray-300">
              <span>
                {a.userId?.username} — {a.type}
              </span>
              <span className="text-gray-500">
                {new Date(a.createdAt).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <h2 className="font-bold mb-4">Live Activity</h2>

        <div className="space-y-2 text-sm">
          {activity.map((a) => (
            <div key={a._id} className="flex justify-between text-gray-300">
              <span>
                <b>{a.userId?.username ?? 'User'}</b> — {a.type}
              </span>
              <span className="text-gray-500">
                {new Date(a.createdAt).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
