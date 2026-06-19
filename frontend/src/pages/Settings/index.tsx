import { useState, useEffect } from "react";
import { useSettings, useUpdateSettings, useVerifyVk, useUploadCookies, useDeleteCookies } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, X, Upload, Trash2, Shield } from "lucide-react";
import { TelegramSettings } from "./TelegramSettings";

const TIMEZONES = [
  "Europe/Moscow", "Europe/Kiev", "Europe/Minsk", "Asia/Almaty",
  "Asia/Tashkent", "Asia/Yekaterinburg", "Asia/Novosibirsk", "Asia/Krasnoyarsk",
  "Asia/Irkutsk", "Asia/Vladivostok", "Europe/London", "Europe/Berlin",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
];

function Settings() {
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const verifyVk = useVerifyVk();
  const uploadCookies = useUploadCookies();
  const deleteCookies = useDeleteCookies();
  const { addToast } = useToast();

  const [vkToken, setVkToken] = useState("");
  const [vkGroupId, setVkGroupId] = useState("");
  const [vkOwnerId, setVkOwnerId] = useState("");
  const [timeSlots, setTimeSlots] = useState<string[]>([]);
  const [timezone, setTimezone] = useState("");
  const [maxWorkers, setMaxWorkers] = useState("3");
  const [publishDelay, setPublishDelay] = useState("5");
  const [ytdlpTimeout, setYtdlpTimeout] = useState("30");
  const [maxPhotoSize, setMaxPhotoSize] = useState("50");
  const [maxVideoSize, setMaxVideoSize] = useState("500");
  const [newSlot, setNewSlot] = useState("12:00");
  const [verifyResult, setVerifyResult] = useState<any>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);

  useEffect(() => {
    if (settings) {
      setVkGroupId(settings.vk_group_id?.toString() || "");
      setVkOwnerId(settings.vk_owner_id?.toString() || "");
      setTimeSlots(settings.time_slots || ["10:00", "15:00", "20:00"]);
      setTimezone(settings.timezone || "Europe/Moscow");
      setMaxWorkers(settings.max_download_workers?.toString() || "3");
      setPublishDelay(settings.vk_publish_delay_seconds?.toString() || "5");
      setYtdlpTimeout(settings.ytdlp_timeout_seconds?.toString() || "30");
      setMaxPhotoSize(settings.max_photo_size_mb?.toString() || "50");
      setMaxVideoSize(settings.max_video_size_mb?.toString() || "500");
    }
  }, [settings]);

  const handleSave = async () => {
    try {
      const data: Record<string, unknown> = {
        vk_group_id: parseInt(vkGroupId) || undefined,
        vk_owner_id: parseInt(vkOwnerId) || undefined,
        time_slots: timeSlots.sort(),
        timezone,
        max_download_workers: parseInt(maxWorkers),
        vk_publish_delay_seconds: parseInt(publishDelay),
        ytdlp_timeout_seconds: parseInt(ytdlpTimeout),
        max_photo_size_mb: parseInt(maxPhotoSize),
        max_video_size_mb: parseInt(maxVideoSize),
      };
      if (vkToken) data.vk_token = vkToken;
      await updateSettings.mutateAsync(data);
      setVkToken("");
      addToast({ title: "Сохранено", description: "Настройки обновлены", variant: "success" });
    } catch {
      addToast({ title: "Ошибка", description: "Не удалось сохранить настройки", variant: "destructive" });
    }
  };

  const handleVerify = async () => {
    setVerifyLoading(true);
    setVerifyResult(null);
    try {
      const result = await verifyVk.mutateAsync({
        vk_token: vkToken || settings?.vk_token_hint?.replace("***", "") || "",
        vk_group_id: parseInt(vkGroupId),
        vk_owner_id: parseInt(vkOwnerId),
      });
      setVerifyResult(result);
    } catch {
      setVerifyResult({ status: "error", error: "Не удалось проверить" });
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleCookieUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadCookies.mutateAsync(file);
      addToast({ title: "Cookies загружены", description: file.name, variant: "success" });
    } catch {
      addToast({ title: "Ошибка", description: "Не удалось загрузить cookies", variant: "destructive" });
    }
  };

  const handleCookieDelete = async () => {
    try {
      await deleteCookies.mutateAsync();
      addToast({ title: "Удалено", description: "Cookies удалены", variant: "success" });
    } catch {
      addToast({ title: "Ошибка", description: "Не удалось удалить cookies", variant: "destructive" });
    }
  };

  if (isLoading) return <div className="text-muted-foreground text-center py-12">Загрузка...</div>;

  return (
    <div className="max-w-3xl space-y-4 sm:space-y-6">
      <h1 className="text-2xl font-bold">Настройки</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Shield className="w-5 h-5 text-accent" /> VK Подключение</CardTitle>
          <CardDescription>Токен, ID группы и аккаунта модератора</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>VK Token</Label>
            <Input
              type="password"
              placeholder={settings?.vk_token_configured ? `${settings.vk_token_hint}***` : "vk1.a..."}
              value={vkToken}
              onChange={(e) => setVkToken(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Group ID</Label>
              <Input value={vkGroupId} onChange={(e) => setVkGroupId(e.target.value)} placeholder="123456" />
            </div>
            <div className="space-y-2">
              <Label>Owner ID</Label>
              <Input value={vkOwnerId} onChange={(e) => setVkOwnerId(e.target.value)} placeholder="654321" />
            </div>
          </div>

          {verifyResult && (
            <div className={`rounded-lg p-3 text-sm ${verifyResult.status === "ok" ? "bg-green-950/30 border border-green-800" : "bg-red-950/30 border border-red-800"}`}>
              {verifyResult.status === "ok" ? (
                <div className="flex items-center gap-3">
                  <Check className="w-4 h-4 text-green-400" />
                  <div>
                    <span className="text-green-300">{verifyResult.account?.name}</span>
                    <span className="text-muted-foreground mx-2">→</span>
                    <span className="text-green-300">{verifyResult.group?.name}</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-red-400">
                  <X className="w-4 h-4" />
                  {verifyResult.error}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={handleVerify} disabled={verifyLoading}>
              {verifyLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              Проверить
            </Button>
            <Button onClick={handleSave} disabled={updateSettings.isPending}>
              {updateSettings.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Сохранить
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Для получения токена: <a href="https://vkhost.github.io/" target="_blank" className="text-accent hover:underline">vkhost.github.io</a> → Kate Mobile → скопировать от <code>access_token=</code> до <code>&expires_in</code>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Загрузка медиа</CardTitle>
          <CardDescription>Параллельные загрузчики, лимиты размеров, таймаут</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Параллельных загрузчиков (1–10)</Label>
              <Input type="number" min={1} max={10} value={maxWorkers} onChange={(e) => setMaxWorkers(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Таймаут yt-dlp (сек)</Label>
              <Input type="number" min={5} max={300} value={ytdlpTimeout} onChange={(e) => setYtdlpTimeout(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Макс. размер фото (МБ)</Label>
              <Input type="number" min={1} max={50} value={maxPhotoSize} onChange={(e) => setMaxPhotoSize(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Макс. размер видео (МБ)</Label>
              <Input type="number" min={1} max={2048} value={maxVideoSize} onChange={(e) => setMaxVideoSize(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Twitter/X всегда загружается в 1 поток — это ограничение Twitter.</p>
          <Button onClick={handleSave} disabled={updateSettings.isPending}>Сохранить</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cookies для yt-dlp / gallery-dl</CardTitle>
          <CardDescription>Доступ к платформам с авторизацией (Twitter/X, возрастные ограничения)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            {settings?.cookies_uploaded_at ? (
              <Badge variant="default" className="bg-green-900 text-green-200">
                Загружен ({new Date(settings.cookies_uploaded_at).toLocaleDateString("ru-RU")})
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">Не загружен</Badge>
            )}
          </div>
          <div className="flex gap-2">
            <label>
              <Button variant="outline" asChild>
                <span><Upload className="w-4 h-4 mr-2" /> Загрузить cookies.txt</span>
              </Button>
              <input type="file" accept=".txt" className="hidden" onChange={handleCookieUpload} />
            </label>
            {settings?.cookies_uploaded_at && (
              <Button variant="outline" onClick={handleCookieDelete} className="text-red-400 hover:text-red-300">
                <Trash2 className="w-4 h-4 mr-2" /> Удалить
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Экспортируйте cookies из браузера с помощью расширения «Get cookies.txt LOCALLY» (Chrome/Firefox). Войдите в Twitter/X перед экспортом.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Публикация в VK</CardTitle>
          <CardDescription>Задержка между последовательными постами</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 max-w-xs">
            <Label>Задержка между постами (сек, 1–60)</Label>
            <Input type="number" min={1} max={60} value={publishDelay} onChange={(e) => setPublishDelay(e.target.value)} />
          </div>
          <Button onClick={handleSave} disabled={updateSettings.isPending}>Сохранить</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Расписание по умолчанию</CardTitle>
          <CardDescription>Часовой пояс и временные слоты для мастера создания постов</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Часовой пояс</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Временные слоты</Label>
            <div className="flex flex-wrap gap-2">
              {timeSlots.map((slot) => (
                <div key={slot} className="flex items-center gap-1 bg-secondary rounded-md px-3 py-1.5 text-sm">
                  {slot}
                  {timeSlots.length > 1 && (
                    <button onClick={() => setTimeSlots(timeSlots.filter((s) => s !== slot))} className="ml-1 text-muted-foreground hover:text-red-400">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <Input type="time" value={newSlot} onChange={(e) => setNewSlot(e.target.value)} className="w-32" />
              <Button variant="outline" size="sm" onClick={() => {
                if (!timeSlots.includes(newSlot)) setTimeSlots([...timeSlots, newSlot].sort());
              }}>Добавить</Button>
            </div>
          </div>
          <Button onClick={handleSave} disabled={updateSettings.isPending}>Сохранить</Button>
        </CardContent>
      </Card>

      <TelegramSettings />
    </div>
  );
}

export default Settings;
