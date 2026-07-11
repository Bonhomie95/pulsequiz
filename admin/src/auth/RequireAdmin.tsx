import { Navigate, Outlet } from 'react-router-dom';
import { useAdminStore } from '../store/adminStore';

const RequireAdmin = () => {
  const admin = useAdminStore((s) => s.admin);
  if (!admin) return <Navigate to="/login" />;
  return <Outlet />;
};

export default RequireAdmin;
