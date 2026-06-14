import { Routes, Route, Navigate, NavLink } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatsHeader } from "@/components/Header/StatsHeader";
import { ToastProvider } from "@/components/ui/use-toast";
import CreatePost from "@/pages/CreatePost";
import Calendar from "@/pages/Calendar";
import NoMedia from "@/pages/NoMedia";
import Settings from "@/pages/Settings";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <div className="dark min-h-screen bg-background text-foreground">
          <StatsHeader />
          <div className="flex">
            <nav className="w-56 border-r border-border bg-card min-h-[calc(100vh-57px)] p-3 flex flex-col gap-1">
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
            </nav>
            <main className="flex-1 p-6">
              <Routes>
                <Route path="/" element={<Navigate to="/create/art" replace />} />
                <Route path="/create/:type" element={<CreatePost />} />
                <Route path="/posts/calendar" element={<Calendar />} />
                <Route path="/posts/no-media" element={<NoMedia />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </main>
          </div>
        </div>
      </ToastProvider>
    </QueryClientProvider>
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

export default App;
