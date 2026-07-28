"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Role } from "@prisma/client";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  affiliateId: string | null;
  affiliateName: string | null;
  mustChangePassword?: boolean;
  impersonating?: boolean;
  realUserId?: string;
  realUserName?: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  signOut: async () => {},
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  const { data: user = null, isLoading, refetch } = useQuery({
    queryKey: queryKeys.me,
    queryFn: async () => {
      try {
        return await apiFetch<AuthUser>("/api/me");
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.me });
    await refetch();
  }, [queryClient, refetch]);

  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      refresh();
    });

    return () => subscription.unsubscribe();
  }, [refresh]);

  const signOut = async () => {
    await fetch("/api/auth/signout", { method: "POST" });
    queryClient.setQueryData(queryKeys.me, null);
    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider
      value={{ user, loading: isLoading, signOut, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
