import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Tables } from "@/integrations/supabase/types";

type ProfileRow = Tables<"profiles">;

async function getProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data;
}

export function useProfile() {
  const { user } = useAuth();
  const query = useQuery<ProfileRow | null>({
    queryKey: ["profile", user?.id ?? "anon"],
    queryFn: () => getProfile(user!.id),
    enabled: Boolean(user?.id),
    staleTime: 60_000,
  });
  return {
    profile: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}
