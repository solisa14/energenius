import { AppShell } from "@/components/layout/AppShell";
import { WattBotPageCard } from "@/components/dashboard/ChatPanel";

export default function ChatPage() {
  return (
    <AppShell title="Chat" breadcrumb="Home / Chat">
      <WattBotPageCard />
    </AppShell>
  );
}
