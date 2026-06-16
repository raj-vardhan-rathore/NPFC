import { create } from "zustand";

interface Session {
  token?: string;
  user?: { id: string; name: string; role: string };
  setSession: (token: string, user: Session["user"]) => void;
  logout: () => void;
}

const stored = localStorage.getItem("npfc-session");

export const useSession = create<Session>((set) => ({
  ...(stored ? JSON.parse(stored) : {}),
  setSession: (token, user) => {
    localStorage.setItem("npfc-session", JSON.stringify({ token, user }));
    set({ token, user });
  },
  logout: () => {
    localStorage.removeItem("npfc-session");
    set({ token: undefined, user: undefined });
  }
}));
