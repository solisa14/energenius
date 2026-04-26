import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useChat } from "@/hooks/useChat";
import { useAuth } from "@/contexts/AuthContext";
import { useChatThreadStore } from "@/stores/chatThread";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const PRESETS = [
  "Why is 2 PM the best time today?",
  "Don't run the dishwasher before 9 AM",
  "What's grid carbon doing tomorrow?",
];

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  pending?: boolean;
  errored?: boolean;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function PendingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}

function PanelHeader({
  collapsed,
  onToggleCollapse,
  showCollapse,
  compact = false,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  showCollapse: boolean;
  /** Tighter copy and padding for the 240px sidebar. */
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border",
        compact ? "px-2" : "gap-3 px-4",
      )}
    >
      <div className="min-w-0 flex flex-col">
        <h4 className="text-h4 text-foreground leading-tight">WattBot</h4>
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[hsl(var(--accent-secondary))] opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[hsl(var(--accent-secondary))]" />
          </span>
          <span
            className={cn(
              "text-caption text-muted-foreground",
              compact && "truncate",
            )}
          >
            {compact ? "Online" : "Online · remembers your prefs"}
          </span>
        </div>
      </div>
      {showCollapse && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={collapsed ? "Expand chat" : "Minimize chat"}
          onClick={onToggleCollapse}
        >
          <span className="material-symbols-outlined text-[20px]">
            {collapsed ? "expand_less" : "expand_more"}
          </span>
        </Button>
      )}
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={cn("flex flex-col", isUser ? "items-end" : "items-start")}>
      <div
        className={cn(
          "rounded-xl px-3 py-2 text-body-sm",
          isUser
            ? "max-w-[75%] bg-primary text-primary-foreground"
            : "max-w-[85%] bg-card border border-border text-card-foreground",
        )}
      >
        {msg.pending ? <PendingDots /> : <span className="whitespace-pre-wrap">{msg.content}</span>}
      </div>
      {!isUser && msg.sources && msg.sources.length > 0 && (
        <div className="mt-1 text-caption text-muted-foreground">
          {msg.sources.filter((s) => s.trim()).join(" · ")}
        </div>
      )}
    </div>
  );
}

function ChatBody({
  fillHeight = false,
  sidebarLayout = false,
}: {
  fillHeight?: boolean;
  /** Constrain scroll area when embedded in the narrow sidebar column. */
  sidebarLayout?: boolean;
}) {
  const { user } = useAuth();
  const userId = user?.id ?? "anon";
  const { sendMessageAsync, isLoading } = useChat();
  const setThreadId = useChatThreadStore((s) => s.setThreadId);
  const threadId = useChatThreadStore((s) => s.threadsByUser[userId]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastUserMessage, setLastUserMessage] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new message
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Auto-grow textarea (max ~3 lines)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 96) + "px";
  }, [input]);

  const send = async (content: string) => {
    const text = content.trim();
    if (!text || isLoading) return;
    setError(null);
    setLastUserMessage(text);

    const userMsg: Message = { id: uid(), role: "user", content: text };
    const pendingId = uid();
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: pendingId, role: "assistant", content: "", pending: true },
    ]);
    setInput("");

    try {
      const res = await sendMessageAsync({ message: text, threadId });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingId
            ? { ...m, pending: false, content: res.reply, sources: res.sources }
            : m,
        ),
      );
      if (res.thread_id) setThreadId(userId, res.thread_id);
    } catch (e) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingId
            ? { ...m, pending: false, errored: true, content: "" }
            : m,
        ),
      );
      setError("Connection hiccup — try again");
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const onRetry = () => {
    if (lastUserMessage) {
      // Drop the failed pending bubble, then resend.
      setMessages((prev) => prev.filter((m) => !m.errored));
      send(lastUserMessage);
    }
  };

  const inner = (
    <>
      <div
        ref={scrollRef}
        className={cn(
          "min-h-0 overflow-y-auto scrollbar-thin",
          fillHeight && "flex-1",
          sidebarLayout && "min-h-0 flex-1",
        )}
      >
        <div className="flex flex-col gap-2 p-3">
          {messages
            .filter((m) => !m.errored)
            .map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap gap-1.5 border-t border-border px-3 pt-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => {
              setInput(p);
              textareaRef.current?.focus();
            }}
            className="rounded-full border border-border px-2 py-1 text-caption text-muted-foreground hover:bg-muted transition-colors"
          >
            {p}
          </button>
        ))}
      </div>

      <div className="shrink-0 px-3 pb-3 pt-2">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Ask anything"
            className="flex-1 resize-none overflow-hidden rounded-md border border-border bg-background px-3 py-2 text-body-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-h-24"
          />
          <button
            type="button"
            disabled={isLoading || !input.trim()}
            onClick={() => send(input)}
            aria-label="Send message"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-primary text-accent-primary-foreground hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <span className="material-symbols-outlined text-[20px]">
              arrow_upward
            </span>
          </button>
        </div>
        {!sidebarLayout && (
          <p className="mt-2 text-caption text-muted-foreground">
            WattBot can explain your recommendations, remember your scheduling preferences, and search the web for energy tips.
          </p>
        )}
        {error && (
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-caption text-destructive">{error}</span>
            <Button variant="ghost" size="sm" onClick={onRetry}>
              Retry
            </Button>
          </div>
        )}
      </div>
    </>
  );

  if (sidebarLayout) {
    return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{inner}</div>;
  }

  return inner;
}

/** Full-width chat for the /chat route; reuses the same state and API as the sidebar. */
export function WattBotPageCard() {
  return (
    <Card className="flex h-[min(70vh,720px)] min-h-[420px] flex-col overflow-hidden rounded-2xl p-0 shadow-level-1">
      <PanelHeader
        compact={false}
        collapsed={false}
        onToggleCollapse={() => undefined}
        showCollapse={false}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <ChatBody fillHeight />
      </div>
    </Card>
  );
}

/** FAB + full-screen sheet; mount from AppShell on &lt; lg so it appears on every page. */
export function WattBotMobile() {
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!isMobile) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Open WattBot"
        onClick={() => setMobileOpen(true)}
        className="fixed bottom-4 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent-primary text-accent-primary-foreground shadow-[var(--shadow-2)] hover:brightness-95"
      >
        <span className="material-symbols-outlined text-[24px]">chat_bubble</span>
      </button>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="bottom" className="h-[100dvh] p-0 flex flex-col">
          <PanelHeader
            collapsed={false}
            onToggleCollapse={() => setMobileOpen(false)}
            showCollapse
          />
          <ChatBody fillHeight />
        </SheetContent>
      </Sheet>
    </>
  );
}

/** Collapsible card for the primary sidebar (lg+). Stays in the sidebar column; expanded uses extra height, not fixed positioning. */
export function WattBotSidebarPanel() {
  const { user } = useAuth();
  const userId = user?.id ?? "anon";
  const collapsed = useChatThreadStore((s) => !!s.collapsedByUser[userId]);
  const setCollapsed = useChatThreadStore((s) => s.setCollapsed);

  return (
    <Card
      className={cn(
        "relative z-10 flex w-full flex-col overflow-hidden p-0 shadow-level-1",
        collapsed ? "h-14" : "min-h-0 h-[min(520px,calc(100dvh-14rem))] max-h-[calc(100dvh-14rem)]",
      )}
    >
      <PanelHeader
        compact
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(userId, !collapsed)}
        showCollapse
      />
      {!collapsed && <ChatBody sidebarLayout />}
    </Card>
  );
}