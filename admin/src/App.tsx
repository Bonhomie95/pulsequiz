import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import RequireAdmin from './auth/RequireAdmin';
import AdminLayout from './layouts/AdminLayout';
import Users from './pages/Users';
import Payouts from './pages/Payouts';
import Purchases from './pages/Purchases';
import Reports from './pages/Reports';
import AntiCheat from './pages/AntiCheat';
import Settings from './pages/Settings';
import Questions from './pages/Questions';
import Tournaments from './pages/Tournaments';
import Challenges from './pages/Challenges';
import Subscriptions from './pages/Subscriptions';
import Leaderboard from './pages/Leaderboard';
import Analytics from './pages/Analytics';
import ActivityLog from './pages/ActivityLog';
import AuditLog from './pages/AuditLog';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<RequireAdmin />}>
          <Route element={<AdminLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/users" element={<Users />} />
            <Route path="/payouts" element={<Payouts />} />
            <Route path="/purchases" element={<Purchases />} />
            <Route path="/subscriptions" element={<Subscriptions />} />
            <Route path="/questions" element={<Questions />} />
            <Route path="/tournaments" element={<Tournaments />} />
          <Route path="/challenges" element={<Challenges />} />
            <Route path="/anticheat" element={<AntiCheat />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/activity" element={<ActivityLog />} />
            <Route path="/audit" element={<AuditLog />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
