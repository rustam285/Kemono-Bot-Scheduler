import { useState, useEffect } from "react";
import {
  useTelegramStatus,
  useTelegramAuthStart,
  useTelegramAuthResend,
  useTelegramAuthComplete,
  useTelegramAuthPassword,
  useTelegramChannels,
  useTelegramSelectChannel,
  useSettings,
} from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Check, Send } from "lucide-react";

function TelegramSettings() {
  const { data: tgStatus, isLoading: statusLoading } = useTelegramStatus();
  const { data: settings } = useSettings();
  const authStart = useTelegramAuthStart();
  const authResend = useTelegramAuthResend();
  const authComplete = useTelegramAuthComplete();
  const authPassword = useTelegramAuthPassword();
  const { data: channels } = useTelegramChannels();
  const selectChannel = useTelegramSelectChannel();
  const { addToast } = useToast();

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [phoneCodeHash, setPhoneCodeHash] = useState("");
  const [authStep, setAuthStep] = useState<"phone" | "code" | "password">("phone");
  const [selectedChannel, setSelectedChannel] = useState<string>("");
  const [nextType, setNextType] = useState<string>("");
  const [resendTimer, setResendTimer] = useState(0);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const id = setInterval(() => setResendTimer((t) => t - 1), 1000);
    return () => clearInterval(id);
  }, [resendTimer]);
  const status = tgStatus?.status || "not_configured";
  const isAuthorized = status === "authorized";

  useEffect(() => {
    if (settings?.tg_channel_id && channels) {
      const ch = channels.find((c: any) => c.id === settings.tg_channel_id);
      if (ch) setSelectedChannel(ch.id.toString());
    }
  }, [settings, channels]);

  const handleStartAuth = async () => {
    if (!phone.trim()) return;
    try {
      const result = await authStart.mutateAsync({ phone: phone.trim() });
      setPhoneCodeHash(result.phone_code_hash);
      setNextType(result.next_type || "");
      setAuthStep("code");
      setResendTimer(60);
      addToast({ title: "Код отправлен", description: `Тип: ${result.code_type}, следующий: ${result.next_type}`, variant: "success" });
    } catch (err: any) {
      addToast({ title: "Ошибка", description: err?.message || "Не удалось отправить код", variant: "destructive" });
    }
  };

  const handleResend = async () => {
    if (!phone.trim() || !phoneCodeHash) return;
    try {
      const result = await authResend.mutateAsync({ phone: phone.trim(), phone_code_hash: phoneCodeHash });
      setPhoneCodeHash(result.phone_code_hash);
      setNextType(result.next_type || "");
      setResendTimer(60);
      addToast({ title: "Код переотправлен", description: `Тип: ${result.code_type}, следующий: ${result.next_type}`, variant: "success" });
    } catch (err: any) {
      addToast({ title: "Ошибка", description: err?.message || "Не удалось переотправить", variant: "destructive" });
    }
  };

  const handleCompleteAuth = async () => {
    if (!code.trim()) return;
    try {
      const result = await authComplete.mutateAsync({ code: code.trim(), phone_code_hash: phoneCodeHash });
      if (result.status === "password_required") {
        setAuthStep("password");
        addToast({ title: "Нужен пароль", description: "Введите облачный пароль 2FA", variant: "default" });
      } else {
        setAuthStep("phone");
        setPhone("");
        setCode("");
        addToast({ title: "Авторизован", description: "Telegram подключён", variant: "success" });
      }
    } catch (err: any) {
      addToast({ title: "Ошибка", description: err?.message || "Неверный код", variant: "destructive" });
    }
  };

  const handlePassword = async () => {
    if (!password.trim()) return;
    try {
      await authPassword.mutateAsync({ password: password.trim() });
      setAuthStep("phone");
      setPhone("");
      setCode("");
      setPassword("");
      addToast({ title: "Авторизован", description: "Telegram подключён", variant: "success" });
    } catch (err: any) {
      addToast({ title: "Ошибка", description: err?.message || "Неверный пароль", variant: "destructive" });
    }
  };

  const handleSelectChannel = async () => {
    if (!selectedChannel || !channels) return;
    const ch = channels.find((c: any) => c.id.toString() === selectedChannel);
    if (!ch) return;
    try {
      await selectChannel.mutateAsync({ channel_id: ch.id, channel_title: ch.title });
      addToast({ title: "Канал сохранён", description: ch.title, variant: "success" });
    } catch {
      addToast({ title: "Ошибка", description: "Не удалось сохранить канал", variant: "destructive" });
    }
  };

  const statusBadge = () => {
    switch (status) {
      case "authorized":
        return <Badge className="bg-green-900 text-green-200">Авторизован</Badge>;
      case "password_required":
        return <Badge className="bg-yellow-900 text-yellow-200">Нужен пароль 2FA</Badge>;
      case "session_expired":
        return <Badge variant="destructive">Сессия истекла</Badge>;
      case "not_configured":
        return <Badge variant="outline" className="text-muted-foreground">Не настроен (TG_API_ID/TG_API_HASH)</Badge>;
      default:
        return <Badge variant="outline" className="text-muted-foreground">Не авторизован</Badge>;
    }
  };

  if (statusLoading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Send className="w-5 h-5 text-accent" /> Telegram (MTProto)</CardTitle>
        <CardDescription>Отложенные посты в Telegram через Telethon</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          {statusBadge()}
          {tgStatus?.account && (
            <span className="text-sm text-muted-foreground">
              {tgStatus.account.first_name} {tgStatus.account.last_name} (@{tgStatus.account.username || "—"})
            </span>
          )}
        </div>

        {!isAuthorized && status !== "not_configured" && (
          <div className="space-y-3 p-3 bg-muted/30 rounded-lg">
            {authStep === "phone" && (
              <>
                <div className="space-y-2">
                  <Label>Номер телефона</Label>
                  <Input placeholder="+79001234567" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <Button onClick={handleStartAuth} disabled={authStart.isPending || !phone.trim()}>
                  {authStart.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                  Отправить код
                </Button>
              </>
            )}

            {authStep === "code" && (
              <>
                <div className="space-y-2">
                  <Label>Код подтверждения</Label>
                  <Input placeholder="12345" value={code} onChange={(e) => setCode(e.target.value)} />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleCompleteAuth} disabled={authComplete.isPending || !code.trim()}>
                    {authComplete.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                    Подтвердить
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleResend}
                    disabled={authResend.isPending || resendTimer > 0}
                  >
                    {authResend.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 mr-2" />
                    )}
                    {resendTimer > 0 ? `Переотправить (${resendTimer}с)` : "Переотправить (SMS)"}
                  </Button>
                  <Button variant="ghost" onClick={() => { setAuthStep("phone"); setCode(""); setResendTimer(0); }}>Назад</Button>
                </div>
                {nextType && (
                  <p className="text-xs text-muted-foreground">
                    Текущий метод: {authStep === "code" ? "App" : nextType}. Следующий: {nextType}
                  </p>
                )}
              </>
            )}

            {authStep === "password" && (
              <>
                <div className="space-y-2">
                  <Label>Пароль 2FA (облачный пароль)</Label>
                  <Input type="password" placeholder="Введите пароль" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handlePassword} disabled={authPassword.isPending || !password.trim()}>
                    {authPassword.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                    Войти
                  </Button>
                  <Button variant="ghost" onClick={() => { setAuthStep("phone"); setPassword(""); setResendTimer(0); }}>Назад</Button>
                </div>
              </>
            )}
          </div>
        )}

        {isAuthorized && channels && channels.length > 0 && (
          <div className="space-y-2">
            <Label>Канал для публикации</Label>
            <div className="flex gap-2">
              <Select value={selectedChannel} onValueChange={setSelectedChannel}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Выберите канал" />
                </SelectTrigger>
                <SelectContent>
                  {channels.map((ch: any) => (
                    <SelectItem key={ch.id} value={ch.id.toString()}>
                      {ch.title} {ch.username ? `(@${ch.username})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleSelectChannel} disabled={selectChannel.isPending || !selectedChannel}>
                {selectChannel.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Сохранить
              </Button>
            </div>
          </div>
        )}

        {isAuthorized && (!channels || channels.length === 0) && (
          <p className="text-sm text-muted-foreground">Не найдены каналы, где этот аккаунт — администратор.</p>
        )}

        {status === "not_configured" && (
          <p className="text-xs text-muted-foreground">
            Добавьте <code>TG_API_ID</code> и <code>TG_API_HASH</code> в <code>.env</code> файл.
            Получить: <a href="https://my.telegram.org" target="_blank" className="text-accent hover:underline">my.telegram.org</a> → API development tools.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export { TelegramSettings };
