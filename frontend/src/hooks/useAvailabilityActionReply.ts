import { useMutation, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/api/queryKeys";
import { respondAvailabilityAction } from "@/lib/api/client";
import type {
  AvailabilityActionReplyRequest,
  AvailabilityActionReplyResponse,
} from "@/lib/api/types";

interface ReplyVars {
  actionId: string;
  body: AvailabilityActionReplyRequest;
}

export function useAvailabilityActionReply() {
  const queryClient = useQueryClient();
  const mutation = useMutation<AvailabilityActionReplyResponse, Error, ReplyVars>({
    mutationFn: ({ actionId, body }) => respondAvailabilityAction(actionId, body),
    onSuccess: async (result) => {
      if (!result.action.refresh_recommendations) return;
      await Promise.all(
        result.action.affected_dates.map((date) =>
          queryClient.invalidateQueries({ queryKey: qk.recommendations(date) }),
        ),
      );
    },
  });
  return {
    reply: mutation.mutate,
    replyAsync: mutation.mutateAsync,
    data: mutation.data,
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}
