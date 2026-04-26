import { useMutation } from "@tanstack/react-query";
import { syncCalendar } from "@/lib/api/client";
import type { CalendarSyncRequest, CalendarSyncResponse } from "@/lib/api/types";

export function useCalendarSync() {
  const mutation = useMutation<CalendarSyncResponse, Error, CalendarSyncRequest>({
    mutationFn: (body) => syncCalendar(body),
  });
  return {
    sync: mutation.mutate,
    syncAsync: mutation.mutateAsync,
    data: mutation.data,
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}
