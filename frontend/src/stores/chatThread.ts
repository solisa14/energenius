import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ChatThreadState {
  threadsByUser: Record<string, string>;
  collapsedByUser: Record<string, boolean>;
  getThreadId: (userId: string) => string | undefined;
  setThreadId: (userId: string, threadId: string) => void;
  isCollapsed: (userId: string) => boolean;
  setCollapsed: (userId: string, collapsed: boolean) => void;
}

export const useChatThreadStore = create<ChatThreadState>()(
  persist(
    (set, get) => ({
      threadsByUser: {},
      collapsedByUser: {},
      getThreadId: (userId) => get().threadsByUser[userId],
      setThreadId: (userId, threadId) =>
        set((s) => ({
          threadsByUser: { ...s.threadsByUser, [userId]: threadId },
        })),
      isCollapsed: (userId) => !!get().collapsedByUser[userId],
      setCollapsed: (userId, collapsed) =>
        set((s) => ({
          collapsedByUser: { ...s.collapsedByUser, [userId]: collapsed },
        })),
    }),
    { name: "energenius.chatThread" },
  ),
);