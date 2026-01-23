import { create } from 'zustand';

type AdminUser = {
  email: string;
  role: 'SUPER_ADMIN' | 'MODERATOR';
};

type AdminLoginResponse = {
  token: string;
  admin: AdminUser;
};

type AdminState = {
  token: string | null;
  admin: AdminUser | null;
  login: (data: AdminLoginResponse) => void;
  logout: () => void;
};

export const useAdminStore = create<AdminState>((set) => ({
  token: localStorage.getItem('admin_token'),
  admin: null,

  login: (data) => {
    localStorage.setItem('admin_token', data.token);
    set({
      token: data.token,
      admin: data.admin,
    });
  },

  logout: () => {
    localStorage.removeItem('admin_token');
    set({ token: null, admin: null });
  },
}));
