import { useState } from "react";
import { CalendarGrid } from "./CalendarGrid";
import { DayDetail } from "./DayDetail";
import { useCalendar } from "@/api/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

function Calendar() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const { data, isLoading } = useCalendar(year, month);

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);
  const months = [
    { value: 1, label: "Январь" }, { value: 2, label: "Февраль" },
    { value: 3, label: "Март" }, { value: 4, label: "Апрель" },
    { value: 5, label: "Май" }, { value: 6, label: "Июнь" },
    { value: 7, label: "Июль" }, { value: 8, label: "Август" },
    { value: 9, label: "Сентябрь" }, { value: 10, label: "Октябрь" },
    { value: 11, label: "Ноябрь" }, { value: 12, label: "Декабрь" },
  ];

  const prevMonth = () => {
    if (month === 1) { setYear(year - 1); setMonth(12); }
    else setMonth(month - 1);
    setSelectedDate(null);
  };

  const nextMonth = () => {
    if (month === 12) { setYear(year + 1); setMonth(1); }
    else setMonth(month + 1);
    setSelectedDate(null);
  };

  return (
    <div className="flex gap-6">
      <div className="flex-1">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Все посты</h1>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={prevMonth}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Select value={String(month)} onValueChange={(v) => { setMonth(Number(v)); setSelectedDate(null); }}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map((m) => (
                  <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={(v) => { setYear(Number(v)); setSelectedDate(null); }}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" onClick={nextMonth}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="text-muted-foreground text-center py-12">Загрузка...</div>
        ) : (
          <CalendarGrid
            year={year}
            month={month}
            days={data?.days || {}}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
        )}
      </div>

      {selectedDate && (
        <DayDetail
          date={selectedDate}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  );
}

export default Calendar;
