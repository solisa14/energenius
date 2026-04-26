import { useMutation, useQueryClient } from "@tanstack/react-query";
import { postChat } from "@/lib/api/client";
import { qk } from "@/lib/api/queryKeys";
import type { ChatResponse } from "@/lib/api/types";

interface ChatVars {
  message: string;
  threadId?: string;
}

export function useChat() {
  const queryClient = useQueryClient();
  const mutation = useMutation<ChatResponse, Error, ChatVars>({
    mutationFn: ({ message, threadId }) => postChat(message, threadId),
    onSuccess: async (result) => {
      if (!result.assistant_action?.refresh_recommendations) return;
      await Promise.all(
        result.assistant_action.affected_dates.map((date) =>
          queryClient.invalidateQueries({ queryKey: qk.recommendations(date) }),
        ),
      );
    },
  });
  return {
    sendMessage: mutation.mutate,
    sendMessageAsync: mutation.mutateAsync,
    data: mutation.data,
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}
