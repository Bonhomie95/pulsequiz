import { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAdminStore } from '../store/adminStore';

const RequireAdmin = () => {
  const admin = useAdminStore((s) => s.admin);
  const refresh = useAdminStore((s) => s.refresh);

  // The stored profile is a convenience cache — the browser owner can edit
  // localStorage and hand themselves a SUPER_ADMIN badge. Re-read the real
  // identity from the server on mount so the UI reflects the token's role.
  // (The server enforces this independently; this only keeps the UI honest.)
  useEffect(() => {
    if (admin) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!admin) return <Navigate to="/login" replace />;
  return <Outlet />;
};

export default RequireAdmin;
