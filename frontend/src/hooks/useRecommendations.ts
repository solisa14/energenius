import { useQuery } from "@tanstack/react-query";
import { getRecommendations } from "@/lib/api/client";
import { qk } from "@/lib/api/queryKeys";
import type { DailyRecommendation } from "@/lib/api/types";

export function useRecommendations(date?: string) {
  const query = useQuery<DailyRecommendation>({
    queryKey: qk.recommendations(date),
    queryFn: () => getRecommendations(date),
    staleTime: 5 * 60 * 1000,
  });
  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}
