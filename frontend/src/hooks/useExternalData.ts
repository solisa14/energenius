import { useQuery } from "@tanstack/react-query";
import { getExternalData } from "@/lib/api/client";
import { qk } from "@/lib/api/queryKeys";
import type { ExternalData } from "@/lib/api/types";

export function useExternalData(zip: string, date: string) {
  const query = useQuery<ExternalData>({
    queryKey: qk.externalData(zip, date),
    queryFn: () => getExternalData(zip, date),
    enabled: !!zip && !!date,
    staleTime: 5 * 60 * 1000,
  });
  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}
