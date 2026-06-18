import { useStats } from "@/api/client";
import { Menu } from "lucide-react";

function StatsHeader({ onMenuToggle }: { onMenuToggle?: () => void }) {
  const { data: stats, isLoading, error } = useStats();

  if (isLoading) {
    return (
      <header className="bg-card border-b border-border px-4 md:px-6 py-3 flex items-center gap-3">
        <button onClick={onMenuToggle} className="md:hidden p-1.5 rounded-lg hover:bg-muted/50">
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-accent">VK Scheduler</h1>
        <span className="text-sm text-muted-foreground">Loading...</span>
      </header>
    );
  }

  if (error || !stats?.account) {
    return (
      <header className="bg-card border-b border-border px-4 md:px-6 py-3 flex items-center gap-3">
        <button onClick={onMenuToggle} className="md:hidden p-1.5 rounded-lg hover:bg-muted/50">
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-accent">VK Scheduler</h1>
        <a href="/settings" className="text-sm text-red-400 hover:text-red-300">
          ⚠️ Ошибка подключения к VK
        </a>
      </header>
    );
  }

  return (
    <header className="bg-card border-b border-border px-4 md:px-6 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 md:gap-6">
          <button onClick={onMenuToggle} className="md:hidden p-1.5 rounded-lg hover:bg-muted/50 flex-shrink-0">
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-accent">VK Scheduler</h1>
          <div className="hidden sm:flex items-center gap-2">
            {stats.account.photo_url && (
              <img src={stats.account.photo_url} alt="" className="w-7 h-7 rounded-full" />
            )}
            <span className="text-sm text-foreground">{stats.account.name}</span>
          </div>
          <span className="hidden sm:inline text-muted-foreground">→</span>
          <div className="hidden sm:flex items-center gap-2">
            {stats.group.photo_url && (
              <img src={stats.group.photo_url} alt="" className="w-7 h-7 rounded-full" />
            )}
            <span className="text-sm text-foreground">{stats.group.name}</span>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-6 text-sm">
          <div>
            <span className="text-muted-foreground">Отложено: </span>
            <span className="font-semibold text-accent">{stats.total_scheduled}</span>
          </div>
          {stats.last_post_datetime && (
            <div>
              <span className="text-muted-foreground">Последний: </span>
              <span className="font-medium">{formatDate(stats.last_post_datetime)}</span>
            </div>
          )}
          {stats.last_dense_date && (
            <div>
              <span className="text-muted-foreground">Насыщено до: </span>
              <span className="font-medium text-art">{formatDateShort(stats.last_dense_date)}</span>
            </div>
          )}
        </div>
        <div className="flex md:hidden items-center gap-3 text-xs">
          <div>
            <span className="text-muted-foreground">Отложено </span>
            <span className="font-semibold text-accent">{stats.total_scheduled}</span>
          </div>
          {stats.last_dense_date && (
            <div>
              <span className="text-muted-foreground">до </span>
              <span className="font-medium text-art">{formatDateShort(stats.last_dense_date)}</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " " + d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export { StatsHeader };
