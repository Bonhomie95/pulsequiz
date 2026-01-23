export default function Dashboard() {
  return (
    <div>
      <h1 className="text-2xl font-black mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat title="Total Users" value="—" />
        <Stat title="Online Users" value="—" />
        <Stat title="Revenue" value="—" />
        <Stat title="Pending Payouts" value="—" />
      </div>
    </div>
  );
}

function Stat({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="text-sm text-gray-400">{title}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
    </div>
  );
}
