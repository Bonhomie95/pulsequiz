import { useEffect, useState } from 'react';
import { adminApi } from '../api/client';
import {
  TrendingUp,
  DollarSign,
  Users,
  RefreshCw,
  Crown,
} from 'lucide-react';

type DailyRevenue = { date: string; revenue: number; purchases: number };
type DailySignups = { date: string; signups: number };
type AnalyticsData = {
  totalRevenue: number;
  revenueThisMonth: number;
  revenueLastMonth: number;
  totalUsers: number;
  newUsersThisMonth: number;
  activePremium: number;
  dailyRevenue: DailyRevenue[];
  dailySignups: DailySignups[];
  revenueByPlan: {
    sku: string;
    label: string;
    revenue: number;
    count: number;
  }[];
};

const PLAN_LABELS: Record<string, string> = {
  pq_premium_monthly: 'Monthly',
  pq_premium_3month: '3 Months',
  pq_premium_6month: '6 Months',
  pq_premium_yearly: '12 Months',
};

function MiniBar({
  value,
  max,
  color = 'bg-indigo-500',
}: {
  value: number;
  max: number;
  color?: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// Simple inline sparkline using div bars — no chart library needed
function Sparkline({
  data,
  valueKey,
  color = 'bg-indigo-500',
}: {
  data: any[];
  valueKey: string;
  color?: string;
}) {
  if (!data.length) return <div className="text-gray-600 text-xs">No data</div>;
  const max = Math.max(...data.map((d) => d[valueKey]), 1);
  return (
    <div className="flex items-end gap-0.5 h-16 w-full">
      {data.slice(-30).map((d, i) => {
        const h = Math.max(4, Math.round((d[valueKey] / max) * 64));
        return (
          <div key={i} className="flex-1 group relative">
            <div
              className={`${color} rounded-sm opacity-80 hover:opacity-100 transition`}
              style={{ height: `${h}px` }}
            />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-gray-800 text-white text-xs px-1.5 py-0.5 rounded whitespace-nowrap z-10">
              {d.date}: {d[valueKey]}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon,
  color = 'text-white',
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  color?: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-gray-400 text-sm">{label}</span>
        <div className="p-2 bg-gray-800 rounded-xl">{icon}</div>
      </div>
      <p className={`text-2xl font-extrabold ${color}`}>{value}</p>
      {sub && <p className="text-gray-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}

export default function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<'30d' | '90d' | 'all'>('30d');

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const res = await adminApi.get(`/admin/analytics?range=${range}`);
      setData(res.data);
    } catch (e) {
      console.error('Analytics fetch error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [range]);

  const momChange = data
    ? data.revenueLastMonth > 0
      ? (
          ((data.revenueThisMonth - data.revenueLastMonth) /
            data.revenueLastMonth) *
          100
        ).toFixed(1)
      : null
    : null;

  const maxPlanRevenue = data
    ? Math.max(...(data.revenueByPlan ?? []).map((p) => p.revenue), 1)
    : 1;

  return (
    <div className="text-white">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2">
            <TrendingUp size={22} className="text-indigo-400" /> Revenue
            Analytics
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Platform financial overview
          </p>
        </div>
        <div className="flex gap-2">
          {(['30d', '90d', 'all'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${range === r ? 'bg-indigo-600' : 'bg-gray-800 hover:bg-gray-700'}`}
            >
              {r === '30d' ? 'Last 30d' : r === '90d' ? 'Last 90d' : 'All Time'}
            </button>
          ))}
          <button
            onClick={fetchAnalytics}
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg text-xs font-bold transition"
          >
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-500">
          Loading analytics…
        </div>
      ) : !data ? (
        <div className="text-center py-20 text-gray-500">
          Failed to load analytics data.
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            <StatCard
              label="Total Revenue"
              value={`$${data.totalRevenue.toFixed(2)}`}
              icon={<DollarSign size={18} className="text-green-400" />}
              color="text-green-400"
            />
            <StatCard
              label="This Month"
              value={`$${data.revenueThisMonth.toFixed(2)}`}
              sub={
                momChange !== null
                  ? `${Number(momChange) >= 0 ? '+' : ''}${momChange}% vs last month`
                  : undefined
              }
              icon={<TrendingUp size={18} className="text-indigo-400" />}
              color={
                momChange !== null && Number(momChange) >= 0
                  ? 'text-green-400'
                  : 'text-red-400'
              }
            />
            <StatCard
              label="Total Users"
              value={data.totalUsers.toLocaleString()}
              sub={`+${data.newUsersThisMonth} this month`}
              icon={<Users size={18} className="text-blue-400" />}
            />
            <StatCard
              label="Active Premium"
              value={data.activePremium.toLocaleString()}
              sub={
                data.totalUsers > 0
                  ? `${((data.activePremium / data.totalUsers) * 100).toFixed(1)}% conversion`
                  : undefined
              }
              icon={<Crown size={18} className="text-yellow-400" />}
              color="text-yellow-400"
            />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
            {/* Daily Revenue Sparkline */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-sm">Daily Revenue</h3>
                <span className="text-gray-500 text-xs">
                  Last {data.dailyRevenue.length} days
                </span>
              </div>
              <Sparkline
                data={data.dailyRevenue}
                valueKey="revenue"
                color="bg-green-500"
              />
              <div className="flex justify-between mt-2 text-gray-600 text-xs">
                <span>{data.dailyRevenue[0]?.date ?? ''}</span>
                <span>
                  {data.dailyRevenue[data.dailyRevenue.length - 1]?.date ?? ''}
                </span>
              </div>
            </div>

            {/* Daily Signups Sparkline */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-sm">Daily Signups</h3>
                <span className="text-gray-500 text-xs">
                  Last {data.dailySignups.length} days
                </span>
              </div>
              <Sparkline
                data={data.dailySignups}
                valueKey="signups"
                color="bg-indigo-500"
              />
              <div className="flex justify-between mt-2 text-gray-600 text-xs">
                <span>{data.dailySignups[0]?.date ?? ''}</span>
                <span>
                  {data.dailySignups[data.dailySignups.length - 1]?.date ?? ''}
                </span>
              </div>
            </div>
          </div>

          {/* Revenue by plan */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-6">
            <h3 className="font-bold text-sm mb-4">
              Revenue by Subscription Plan
            </h3>
            {data.revenueByPlan.length === 0 ? (
              <p className="text-gray-500 text-sm">
                No subscription revenue yet.
              </p>
            ) : (
              <div className="space-y-4">
                {data.revenueByPlan.map((plan) => (
                  <div key={plan.sku}>
                    <div className="flex items-center justify-between mb-1.5 text-sm">
                      <span className="font-semibold">
                        {PLAN_LABELS[plan.sku] ?? plan.sku}
                      </span>
                      <div className="flex items-center gap-4">
                        <span className="text-gray-400 text-xs">
                          {plan.count} subs
                        </span>
                        <span className="text-green-400 font-bold">
                          ${plan.revenue.toFixed(2)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <MiniBar
                        value={plan.revenue}
                        max={maxPlanRevenue}
                        color="bg-green-500"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* IAP Purchases breakdown */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <h3 className="font-bold text-sm mb-4">Daily Purchases (Volume)</h3>
            <Sparkline
              data={data.dailyRevenue}
              valueKey="purchases"
              color="bg-yellow-500"
            />
          </div>
        </>
      )}
    </div>
  );
}
