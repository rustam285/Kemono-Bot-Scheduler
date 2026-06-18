import { useState, useEffect } from "react";
import { Routes, Route, Navigate, NavLink, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatsHeader } from "@/components/Header/StatsHeader";
import { ToastProvider } from "@/components/ui/use-toast";
import CreatePost from "@/pages/CreatePost";
import Calendar from "@/pages/Calendar";
import NoMedia from "@/pages/NoMedia";
import Settings from "@/pages/Settings";
import { Plus, CalendarDays, AlertTriangle, Settings2 } from "lucide-react";

const queryClient = new QueryClient();

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <div className="dark min-h-screen bg-background text-foreground">
          <StatsHeader onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />

          <div className="flex">
            {/* Desktop sidebar */}
            <nav className="hidden md:flex w-56 border-r border-border bg-card min-h-[calc(100vh-57px)] p-3 flex-col gap-1 flex-shrink-0">
              <SidebarContent />
            </nav>

            {/* Mobile sidebar overlay */}
            {sidebarOpen && (
              <div
                className="fixed inset-0 bg-black/50 z-40 md:hidden"
                onClick={() => setSidebarOpen(false)}
              />
            )}

            {/* Mobile sidebar */}
            <nav
              className={`fixed top-[57px] left-0 bottom-0 w-64 bg-card border-r border-border p-3 flex flex-col gap-1 z-50 transition-transform duration-200 md:hidden ${
                sidebarOpen ? "translate-x-0" : "-translate-x-full"
              }`}
            >
              <SidebarContent />
            </nav>

            <main className="flex-1 p-4 md:p-6 pb-24 md:pb-6 min-h-[calc(100vh-57px)]">
              <Routes>
                <Route path="/" element={<Navigate to="/create/art" replace />} />
                <Route path="/create/:type" element={<CreatePost />} />
                <Route path="/posts/calendar" element={<Calendar />} />
                <Route path="/posts/no-media" element={<NoMedia />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </main>
          </div>

          {/* Mobile bottom nav */}
          <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border flex justify-around items-center py-2 px-2 z-30 md:hidden"
            style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
            <BottomNavItem to="/create/art" icon={<Plus className="w-5 h-5" />} label="Создать" />
            <BottomNavItem to="/posts/calendar" icon={<CalendarDays className="w-5 h-5" />} label="Посты" />
            <BottomNavItem to="/posts/no-media" icon={<AlertTriangle className="w-5 h-5" />} label="Без медиа" />
            <BottomNavItem to="/settings" icon={<Settings2 className="w-5 h-5" />} label="Настройки" />
          </nav>
        </div>
      </ToastProvider>
    </QueryClientProvider>
  );
}

function SidebarContent() {
  return (
    <>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-2">Создать</p>
      <NavItem to="/create/art" label="Art" color="bg-art" />
      <NavItem to="/create/fursuit" label="Fursuit" color="bg-fursuit" />
      <NavItem to="/create/video" label="Video" color="bg-video" />
      <div className="my-2 border-t border-border" />
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-2">Посты</p>
      <NavItem to="/posts/calendar" label="Все посты" icon="📅" />
      <NavItem to="/posts/no-media" label="Без медиа" icon="⚠️" />
      <div className="my-2 border-t border-border" />
      <NavItem to="/settings" label="Настройки" icon="⚙️" />
    </>
  );
}

function NavItem({ to, label, color, icon }: { to: string; label: string; color?: string; icon?: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
          isActive
            ? "bg-accent/15 text-accent font-medium"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
        }`
      }
    >
      {color && <span className={`w-3 h-3 rounded-full ${color}`} />}
      {icon && <span className="text-base">{icon}</span>}
      {label}
    </NavLink>
  );
}

function BottomNavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex flex-col items-center gap-1 py-1 px-3 rounded-lg text-[10px] min-w-[56px] transition-colors ${
          isActive ? "text-accent" : "text-muted-foreground"
        }`
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}

export default App;
