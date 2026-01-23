import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAdminStore } from '../store/adminStore';

/* ---------------------------------- */
/* Reusable link item (MUST be outside) */
/* ---------------------------------- */

type LinkItemProps = {
  to: string;
  label: string;
  onClick?: () => void;
};

function LinkItem({ to, label, onClick }: LinkItemProps) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `block px-4 py-2 rounded-lg transition
         ${isActive ? 'bg-indigo-600' : 'hover:bg-gray-800'}`
      }
    >
      {label}
    </NavLink>
  );
}

/* ---------------------------------- */
/* Sidebar                             */
/* ---------------------------------- */

export default function Sidebar() {
  const [open, setOpen] = useState(false);
  const logout = useAdminStore((s) => s.logout);
  const navigate = useNavigate();

  const closeMobile = () => setOpen(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between p-4 border-b border-gray-800">
        <button onClick={() => setOpen(true)}>☰</button>
        <span className="font-bold">Admin</span>
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
          top-0 left-0 h-full w-64
          bg-gray-900 border-r border-gray-800
          transform transition-transform
          ${open ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0
        `}
      >
        <div className="p-4 font-extrabold text-lg">PulseQuiz Admin</div>

        <nav className="flex flex-col gap-1 px-2">
          <LinkItem to="/" label="Dashboard" onClick={closeMobile} />
          <LinkItem to="/users" label="Users" onClick={closeMobile} />
          <LinkItem to="/payouts" label="Payouts" onClick={closeMobile} />
          <LinkItem to="/purchases" label="Purchases" onClick={closeMobile} />
          <LinkItem to="/reports" label="Reports" onClick={closeMobile} />

          <button
            onClick={handleLogout}
            className="mt-4 text-left px-4 py-2 rounded-lg hover:bg-red-600 transition"
          >
            Logout
          </button>
        </nav>
      </aside>
    </>
  );
}
