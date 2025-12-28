import { create } from 'zustand';

type User = {
  id: string;
  email: string;
  username?: string;
  avatar?: string;
};

type AuthState = {
  user: User | null;
  isAuthenticated: boolean;

  setUser: (user: User) => void;
  setUsernameAndAvatar: (username: string, avatar: string) => void;
  mockLogin: () => void;
  logout: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  mockLogin: () =>
    set({
      user: {
        id: 'local-dev-user',
        email: 'dev@pulsequiz.app',
        username: 'pulse_dev',
        avatar: 'avatar1',
      },
      isAuthenticated: true,
    }),

  setUser: (user) =>
    set({
      user,
      isAuthenticated: true,
    }),

  setUsernameAndAvatar: (username, avatar) =>
    set((state) => ({
      user: state.user ? { ...state.user, username, avatar } : null,
    })),

  logout: () =>
    set({
      user: null,
      isAuthenticated: false,
    }),
}));
