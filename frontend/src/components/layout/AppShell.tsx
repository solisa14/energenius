import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { MobileSidebar } from "./MobileSidebar";
import { TopBar } from "./TopBar";
import { WattBotMobile } from "@/components/dashboard/ChatPanel";

interface Props {
  title: string;
  breadcrumb?: string;
  children: ReactNode;
}

export function AppShell({ title, breadcrumb, children }: Props) {
  return (
    <>
      <div className="flex min-h-screen w-full bg-background">
        <Sidebar />
        <MobileSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <TopBar />
          <main className="flex-1 px-6 py-8">
            {breadcrumb && <div className="text-caption text-muted-foreground">{breadcrumb}</div>}
            <h1 className="text-h1 text-foreground mt-1">{title}</h1>
            <div className="mt-6">{children}</div>
          </main>
        </div>
      </div>
      <WattBotMobile />
    </>
  );
}
