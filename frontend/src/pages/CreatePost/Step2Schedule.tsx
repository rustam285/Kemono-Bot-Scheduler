import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSettings, usePreview } from "@/api/client";
import { useToast } from "@/components/ui/use-toast";
import { X, Plus, Clock, Loader2 } from "lucide-react";
import type { SourceItem } from "./Step1Sources";

const TYPE_COLORS: Record<string, string> = {
  art: "text-art",
  fursuit: "text-fursuit",
  video: "text-video",
};

interface Step2Props {
  sources: SourceItem[];
  localFiles: File[];
  postType: string;
  startDate: string;
  timeSlots: string[];
  timezone: string;
  sessionKey: string | null;
  platform: "vk" | "tg" | "both";
  onStartDateChange: (d: string) => void;
  onTimeSlotsChange: (slots: string[]) => void;
  onTimezoneChange: (tz: string) => void;
  onSessionKeyChange: (key: string) => void;
  onPreviewResult: (posts: any[]) => void;
  onBack: () => void;
  onNext: () => void;
}

const TIMEZONES = [
  "Europe/Moscow", "Europe/Kiev", "Europe/Minsk", "Asia/Almaty",
  "Asia/Tashkent", "Asia/Yekaterinburg", "Asia/Novosibirsk", "Asia/Krasnoyarsk",
  "Asia/Irkutsk", "Asia/Vladivostok", "Europe/London", "Europe/Berlin",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
];

function Step2Schedule({
  sources, localFiles, postType, startDate, timeSlots, timezone,
  sessionKey, platform, onStartDateChange, onTimeSlotsChange, onTimezoneChange,
  onSessionKeyChange, onPreviewResult, onBack, onNext,
}: Step2Props) {
  const { data: settings } = useSettings();
  const preview = usePreview();
  const { addToast } = useToast();
  const [newSlot, setNewSlot] = useState("12:00");

  useEffect(() => {
    if (settings && timeSlots.length === 0) {
      onTimeSlotsChange(settings.time_slots || ["10:00", "15:00", "20:00"]);
    }
    if (settings && !timezone) {
      onTimezoneChange(settings.timezone || "Europe/Moscow");
    }
    if (!startDate) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      onStartDateChange(tomorrow.toISOString().split("T")[0]);
    }
  }, [settings]);

  const handlePreview = async () => {
    const ungrouped: typeof sources = [];
    const groups = new Map<number, typeof sources>();

    for (const s of sources) {
      if (s.groupId === null) {
        ungrouped.push(s);
      } else {
        if (!groups.has(s.groupId)) groups.set(s.groupId, []);
        groups.get(s.groupId)!.push(s);
      }
    }

    const postGroups: { source_urls: string[]; media_item_ids: string[] }[] = [];

    for (const s of ungrouped) {
      postGroups.push({
        source_urls: [s.url],
        media_item_ids: s.mediaItems.filter((m) => m.selected).map((m) => m.id),
      });
    }

    for (const [, group] of groups) {
      postGroups.push({
        source_urls: group.map((s) => s.url),
        media_item_ids: group.flatMap((s) => s.mediaItems.filter((m) => m.selected).map((m) => m.id)),
      });
    }

    if (localFiles.length > 0 && postGroups.length > 0) {
      const localIds = localFiles.map((_, i) => `local_${i}`);
      postGroups[0].media_item_ids.push(...localIds);
      postGroups[0].source_urls.push(...localFiles.map((f) => `local:${f.name}`));
    } else if (localFiles.length > 0) {
      postGroups.push({
        source_urls: localFiles.map((f) => `local:${f.name}`),
        media_item_ids: localFiles.map((_, i) => `local_${i}`),
      });
    }

    if (postGroups.length === 0) {
      addToast({ title: "Нет постов", description: "Добавьте источники или файлы", variant: "destructive" });
      return;
    }

    try {
      const result = await preview.mutateAsync({
        post_groups: postGroups,
        post_type: postType,
        start_date: startDate,
        time_slots: timeSlots,
        timezone,
        session_key: sessionKey,
        platform,
      });

      onSessionKeyChange(result.session_key);
      onPreviewResult(result.posts);
      onNext();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Не удалось сгенерировать предпросмотр";
      addToast({ title: "Ошибка предпросмотра", description: msg, variant: "destructive" });
    }
  };

  const addSlot = () => {
    if (!timeSlots.includes(newSlot)) {
      const sorted = [...timeSlots, newSlot].sort();
      onTimeSlotsChange(sorted);
    }
  };

  const removeSlot = (slot: string) => {
    if (timeSlots.length > 1) {
      onTimeSlotsChange(timeSlots.filter((s) => s !== slot));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Настройки планирования</h2>
        <p className="text-sm text-muted-foreground">
          Укажите дату начала, слоты и часовой пояс
        </p>
      </div>

      <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 icon-${postType}`}>
        <div className="space-y-2">
          <Label>Дата начала</Label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>Часовой пояс</Label>
          <Select value={timezone} onValueChange={onTimezoneChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz} value={tz}>{tz}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Временные слоты</Label>
        <div className="flex flex-wrap gap-2">
          {timeSlots.map((slot) => (
            <div key={slot} className="flex items-center gap-1 bg-secondary rounded-md px-3 py-1.5 text-sm">
              <Clock className={`w-3.5 h-3.5 ${TYPE_COLORS[postType] || "text-accent"}`} />
              {slot}
              {timeSlots.length > 1 && (
                <button onClick={() => removeSlot(slot)} className="ml-1 text-muted-foreground hover:text-red-400">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          <Input
            type="time"
            value={newSlot}
            onChange={(e) => setNewSlot(e.target.value)}
            className="w-32"
          />
          <Button variant="outline" size="sm" onClick={addSlot}>
            <Plus className="w-4 h-4 mr-1" /> Добавить слот
          </Button>
        </div>
      </div>

      <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground mb-1">Предпросмотр постов</p>
        <p>
          Постов: <span className="text-accent font-semibold">{(() => {
            const ungrouped = sources.filter((s) => s.groupId === null).length;
            const grouped = new Set(sources.filter((s) => s.groupId !== null).map((s) => s.groupId)).size;
            const localPost = localFiles.length > 0 && sources.length === 0 ? 1 : 0;
            return ungrouped + grouped + localPost;
          })()}</span>,
          начиная с <span className="text-foreground">{startDate}</span> по{" "}
          <span className="text-foreground">{timezone}</span>.
        </p>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>Назад</Button>
        <Button onClick={handlePreview} disabled={preview.isPending || !startDate || timeSlots.length === 0}>
          {preview.isPending ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Генерация...</>
          ) : (
            "Предпросмотр"
          )}
        </Button>
      </div>
    </div>
  );
}

export { Step2Schedule };
