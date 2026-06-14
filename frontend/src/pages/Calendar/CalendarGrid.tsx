import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface DayData {
  art: number;
  fursuit: number;
  video: number;
  total: number;
}

interface CalendarGridProps {
  year: number;
  month: number;
  days: Record<string, DayData>;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function CalendarGrid({ year, month, days, selectedDate, onSelectDate }: CalendarGridProps) {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const daysInMonth = lastDay.getDate();
  let startWeekday = firstDay.getDay();
  if (startWeekday === 0) startWeekday = 7;

  const cells: (number | null)[] = [];
  for (let i = 1; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="grid grid-cols-7 bg-muted/50">
        {WEEKDAYS.map((wd) => (
          <div key={wd} className="text-center text-xs font-medium text-muted-foreground py-2 border-b border-border">
            {wd}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          if (!day) return <div key={i} className="h-24 border-b border-r border-border bg-background/50" />;

          const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const data = days[dateKey];
          const total = data?.total || 0;
          const isSelected = selectedDate === dateKey;
          const isDense = total >= 3;

          return (
            <div
              key={i}
              onClick={() => onSelectDate(dateKey)}
              className={cn(
                "h-24 border-b border-r border-border p-1.5 cursor-pointer transition-colors",
                isSelected && "bg-accent/10 border-accent",
                !isSelected && isDense && "bg-accent/5",
                !isSelected && !isDense && "hover:bg-muted/30"
              )}
            >
              <div className={cn("text-sm font-medium mb-1", isSelected && "text-accent")}>{day}</div>
              {data && (
                <div className="flex flex-wrap gap-1">
                  {data.art > 0 && <Badge variant="art" className="text-[10px] px-1 py-0">{data.art}</Badge>}
                  {data.fursuit > 0 && <Badge variant="fursuit" className="text-[10px] px-1 py-0">{data.fursuit}</Badge>}
                  {data.video > 0 && <Badge variant="video" className="text-[10px] px-1 py-0">{data.video}</Badge>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { CalendarGrid };
