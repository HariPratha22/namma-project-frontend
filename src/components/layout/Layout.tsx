import { ReactNode, useState } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { cn } from "@/lib/utils";

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const [mouse, setMouse] = useState({ x: 0, y: 0 });

  return (
    <div 
      className="flex min-h-screen bg-background relative overflow-hidden"
      onMouseMove={(e) => setMouse({ x: e.clientX, y: e.clientY })}
    >
      {/* Interactive Cursor Glow */}
      <div
        className="pointer-events-none fixed w-80 h-80 rounded-full 
                   bg-violet-500/10 blur-[100px] z-0 transition-all duration-300 ease-out"
        style={{
          top: mouse.y - 160,
          left: mouse.x - 160,
        }}
      />
      
      <Sidebar 
        collapsed={collapsed} 
        onCollapsedChange={setCollapsed} 
        isMobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <div className={cn(
        "flex flex-1 flex-col transition-all duration-300 z-10 w-full",
        collapsed ? "lg:ml-[72px]" : "lg:ml-64",
        "ml-0"
      )}>
        <Header onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-x-hidden bg-gradient-to-br from-[#F5F3FF] via-[#EDE9FE] to-[#DDD6FE] dark:bg-gradient-to-br dark:from-[#020617] dark:via-[#0F172A] dark:to-[#020617] relative before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_top,_rgba(139,92,246,0.25),transparent_60%)] before:pointer-events-none transition-all duration-500 ease-in-out">
          <div className="container relative z-10 py-6 px-4 md:px-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
