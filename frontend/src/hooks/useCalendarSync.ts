import { useMutation } from "@tanstack/react-query";
import { syncCalendar } from "@/lib/api/client";
import type { DayAvailability } from "@/lib/api/types";

export function useCalendarSync() {
  const mutation = useMutation<DayAvailability[], Error, void>({
    mutationFn: () => syncCalendar(),
  });
  return {
    sync: mutation.mutate,
    syncAsync: mutation.mutateAsync,
    data: mutation.data,
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}
