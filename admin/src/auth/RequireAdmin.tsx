import { Navigate, Outlet } from 'react-router-dom';
import { useAdminStore } from '../store/adminStore';

const RequireAdmin = () => {
  const token = useAdminStore((s) => s.token);
  if (!token) return <Navigate to="/login" />;
  return <Outlet />;
};

export default RequireAdmin;
