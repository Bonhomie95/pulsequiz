import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAdminStore } from '../store/adminStore';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Receipt,
  Flag,
  LogOut,
  Menu,
  ChevronLeft,
} from 'lucide-react';

type LinkItemProps = {
  to: string;
  label: string;
  icon: React.ReactNode;
  collapsed: boolean;
  onClick?: () => void;
};

function LinkItem({ to, label, icon, collapsed, onClick }: LinkItemProps) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center ${collapsed ? 'justify-center' : 'gap-3'} 
         px-4 py-3 rounded-lg transition
         ${isActive ? 'bg-indigo-600' : 'hover:bg-gray-800'}`
      }
    >
      {icon}
      {!collapsed && <span>{label}</span>}
    </NavLink>
  );
}

export default function Sidebar() {
  const [open, setOpen] = useState(false);        // mobile drawer
  const [collapsed, setCollapsed] = useState(false); // desktop collapse
  const logout = useAdminStore((s) => s.logout);
  const navigate = useNavigate();

  const closeMobile = () => setOpen(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      {/* Mobile Top Bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 flex items-center px-4 bg-gray-900 border-b border-gray-800 z-40">
        <button onClick={() => setOpen(true)}>
          <Menu size={24} />
        </button>
      </div>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={closeMobile}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed md:static z-50
          top-0 left-0 h-screen
          ${collapsed ? 'w-16' : 'w-64'}
          bg-gray-900 border-r border-gray-800
          flex flex-col justify-between
          transform transition-all duration-300
          ${open ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0
        `}
      >
        {/* Top Section */}
        <div>
          <div className="flex items-center justify-between p-4">
            {!collapsed && <span className="font-extrabold">PulseQuiz Admin</span>}

            {/* Collapse Toggle (desktop only) */}
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="hidden md:block"
            >
              <ChevronLeft
                size={20}
                className={`transition-transform ${collapsed ? 'rotate-180' : ''}`}
              />
            </button>
          </div>

          <nav className="flex flex-col gap-2 px-2 mt-4">
            <LinkItem
              to="/"
              label="Dashboard"
              icon={<LayoutDashboard size={20} />}
              collapsed={collapsed}
              onClick={closeMobile}
            />
            <LinkItem
              to="/users"
              label="Users"
              icon={<Users size={20} />}
              collapsed={collapsed}
              onClick={closeMobile}
            />
            <LinkItem
              to="/payouts"
              label="Payouts"
              icon={<CreditCard size={20} />}
              collapsed={collapsed}
              onClick={closeMobile}
            />
            <LinkItem
              to="/purchases"
              label="Purchases"
              icon={<Receipt size={20} />}
              collapsed={collapsed}
              onClick={closeMobile}
            />
            <LinkItem
              to="/reports"
              label="Reports"
              icon={<Flag size={20} />}
              collapsed={collapsed}
              onClick={closeMobile}
            />
          </nav>
        </div>

        {/* Logout Bottom */}
        <div className="p-2 border-t border-gray-800">
          <button
            onClick={handleLogout}
            className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'} w-full px-4 py-3 rounded-lg hover:bg-red-600 transition`}
          >
            <LogOut size={20} />
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
