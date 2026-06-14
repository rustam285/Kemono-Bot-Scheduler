import { useStats } from "@/api/client";

function StatsHeader() {
  const { data: stats, isLoading, error } = useStats();

  if (isLoading) {
    return (
      <header className="bg-card border-b border-border px-6 py-3">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold text-accent">VK Scheduler</h1>
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      </header>
    );
  }

  if (error || !stats?.account) {
    return (
      <header className="bg-card border-b border-border px-6 py-3">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold text-accent">VK Scheduler</h1>
          <a href="/settings" className="text-sm text-red-400 hover:text-red-300">
            ⚠️ Ошибка подключения к VK
          </a>
        </div>
      </header>
    );
  }

  return (
    <header className="bg-card border-b border-border px-6 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-bold text-accent">VK Scheduler</h1>
          <div className="flex items-center gap-2">
            {stats.account.photo_url && (
              <img src={stats.account.photo_url} alt="" className="w-7 h-7 rounded-full" />
            )}
            <span className="text-sm text-foreground">{stats.account.name}</span>
          </div>
          <span className="text-muted-foreground">→</span>
          <div className="flex items-center gap-2">
            {stats.group.photo_url && (
              <img src={stats.group.photo_url} alt="" className="w-7 h-7 rounded-full" />
            )}
            <span className="text-sm text-foreground">{stats.group.name}</span>
          </div>
        </div>
        <div className="flex items-center gap-6 text-sm">
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
