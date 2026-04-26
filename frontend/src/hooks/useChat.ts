import { useMutation } from "@tanstack/react-query";
import { postChat } from "@/lib/api/client";
import type { ChatResponse } from "@/lib/api/types";

interface ChatVars {
  message: string;
  threadId?: string;
}

export function useChat() {
  const mutation = useMutation<ChatResponse, Error, ChatVars>({
    mutationFn: ({ message, threadId }) => postChat(message, threadId),
  });
  return {
    sendMessage: mutation.mutate,
    sendMessageAsync: mutation.mutateAsync,
    data: mutation.data,
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}
