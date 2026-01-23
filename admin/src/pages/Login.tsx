import { useState } from 'react';
import { adminApi } from '../api/client';
import { useAdminStore } from '../store/adminStore';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const login = useAdminStore((s) => s.login);
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const submit = async () => {
    const res = await adminApi.post('/admin/login', { email, password });
    login(res.data);
    nav('/', { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="bg-gray-900 p-6 rounded-xl w-80">
        <h1 className="text-xl font-bold mb-4">Admin Login</h1>

        <input
          className="w-full mb-3 p-2 rounded bg-gray-800"
          placeholder="Email"
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="w-full mb-3 p-2 rounded bg-gray-800"
          type="password"
          placeholder="Password"
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          onClick={submit}
          className="w-full bg-indigo-600 p-2 rounded font-bold"
        >
          Login
        </button>
      </div>
    </div>
  );
}
