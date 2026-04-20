import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Role, User } from "@/types";
import { users as seedUsers } from "@/data/mock";

interface AuthState {
  currentUserId: string | null;
  isAuthenticated: boolean;
  login: (email: string) => boolean;
  logout: () => void;
  switchRole: (userId: string) => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      currentUserId: null,
      isAuthenticated: false,
      login: (email: string) => {
        const u = seedUsers.find((x) => x.email.toLowerCase() === email.toLowerCase());
        if (u) {
          set({ currentUserId: u.id, isAuthenticated: true });
          return true;
        }
        // fallback: log in as super admin so demo always works
        set({ currentUserId: "u-sa", isAuthenticated: true });
        return true;
      },
      logout: () => set({ currentUserId: null, isAuthenticated: false }),
      switchRole: (userId: string) => set({ currentUserId: userId, isAuthenticated: true }),
    }),
    { name: "emd-auth" },
  ),
);

export function useCurrentUser(): User | null {
  const id = useAuth((s) => s.currentUserId);
  if (!id) return null;
  return seedUsers.find((u) => u.id === id) ?? null;
}

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  senior: "Senior",
  manager: "Manager",
  team_leader: "Team Leader",
  user: "User",
};

export const ROLE_RANK: Record<Role, number> = {
  super_admin: 5,
  senior: 4,
  manager: 3,
  team_leader: 2,
  user: 1,
};
