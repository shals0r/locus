import { create } from "zustand";

interface AuthState {
  token: string | null;
  isSetup: boolean | null; // null = loading, true/false = known
  isAuthenticated: boolean;
  setToken: (token: string) => void;
  clearToken: () => void;
  setIsSetup: (value: boolean) => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem("locus_token"),
  isSetup: null,
  isAuthenticated: !!localStorage.getItem("locus_token"),
  setToken: (token) => {
    localStorage.setItem("locus_token", token);
    set({ token, isAuthenticated: true });
  },
  clearToken: () => {
    localStorage.removeItem("locus_token");
    set({ token: null, isAuthenticated: false });
  },
  setIsSetup: (value) => set({ isSetup: value }),
  checkAuth: async () => {
    // Will be implemented when API is wired
  },
}));
