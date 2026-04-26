// TanStack Query key factories. Keep keys serializable + stable.

export const qk = {
  recommendations: (date?: string) => ["recommendations", date ?? "today"] as const,
  externalData: (zip: string, date: string) =>
    ["externalData", zip, date] as const,
  chat: (threadId?: string) => ["chat", threadId ?? "new"] as const,
} as const;
