import { useMutation, useQueryClient } from "@tanstack/react-query";
import { postFeedback } from "@/lib/api/client";
import type { FeedbackEvent, FeedbackResponse } from "@/lib/api/types";

export function useFeedback() {
  const qc = useQueryClient();
  const mutation = useMutation<FeedbackResponse, Error, FeedbackEvent>({
    mutationFn: (event) => postFeedback(event),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recommendations"] });
    },
  });
  return {
    submit: mutation.mutate,
    submitAsync: mutation.mutateAsync,
    data: mutation.data,
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}
