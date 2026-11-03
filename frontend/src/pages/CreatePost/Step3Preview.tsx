import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { PostCard } from "@/components/PostCard/PostCard";
import { usePublish, useTaskStatus, useCancelTask, useSettings, extractApiError } from "@/api/client";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, CheckCircle, XCircle, ArrowLeft, Ban } from "lucide-react";

interface PreviewPost {
  id: string;
  post_type: string;
  scheduled_at: string;
  media_items: { id: string; type: string; thumbnail_url?: string; original_url?: string; selected?: boolean }[];
  post_text: string;
  source_urls: string[];
  platform: string;
}

interface Step3Props {
  posts: PreviewPost[];
  onPostsChange: (posts: PreviewPost[]) => void;
  onBack: () => void;
  onDone: () => void;
}

function Step3Preview({ posts, onPostsChange, onBack, onDone }: Step3Props) {
  const publish = usePublish();
  const cancelTask = useCancelTask();
  const { data: settings } = useSettings();
  const { addToast } = useToast();
  const [taskId, setTaskId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const taskStatus = useTaskStatus(taskId);

  // Владелец стены: посты выходят от группы, поэтому owner_id = -{group_id}
  const groupId = settings?.vk_group_id;

  const handlePublish = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const result = await publish.mutateAsync({ posts });
      setTaskId(result.task_id);
      addToast({ title: "Публикация начата", description: `Задача: ${result.task_id}`, variant: "success" });
    } catch (err) {
      addToast({ title: "Ошибка", description: extractApiError(err), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!taskId) return;
    try {
      await cancelTask.mutateAsync(taskId);
      addToast({ title: "Отмена", description: "Задача будет остановлена после текущего поста", variant: "default" });
    } catch (err) {
      addToast({ title: "Ошибка", description: extractApiError(err), variant: "destructive" });
    }
  };

  const updatePost = useCallback(
    (id: string, changes: Record<string, unknown>) => {
      onPostsChange(posts.map((p) => (p.id === id ? { ...p, ...changes } : p)));
    },
    [posts, onPostsChange]
  );

  const removePost = useCallback(
    (id: string) => {
      onPostsChange(posts.filter((p) => p.id !== id));
    },
    [posts, onPostsChange]
  );

  const moveUp = useCallback(
    (id: string) => {
      const idx = posts.findIndex((p) => p.id === id);
      if (idx <= 0) return;
      const arr = [...posts];
      [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
      onPostsChange(arr);
    },
    [posts, onPostsChange]
  );

  const moveDown = useCallback(
    (id: string) => {
      const idx = posts.findIndex((p) => p.id === id);
      if (idx >= posts.length - 1) return;
      const arr = [...posts];
      [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
      onPostsChange(arr);
    },
    [posts, onPostsChange]
  );

  const status = taskStatus.data?.status;
  const isRunning = status === "processing" || status === "pending";
  const isDone = status === "completed";
  const isError = status === "error";
  const isCancelled = status === "cancelled" || status === "interrupted";
  const isFinished = isDone || isError || isCancelled;

  const successCount = taskStatus.data?.results?.filter((r: any) => r.status === "ok").length || 0;
  const errorCount = taskStatus.data?.results?.filter((r: any) => r.status === "error").length || 0;
  const progress = taskStatus.data?.progress;

  if (isFinished) {
    return (
      <div className="space-y-6">
        <div className="text-center py-8">
          {isDone ? (
            <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4" />
          ) : (
            <XCircle className="w-16 h-16 mx-auto text-red-500 mb-4" />
          )}
          <h2 className="text-2xl font-bold mb-2">
            {isDone ? "Публикация завершена" : isCancelled ? "Публикация отменена" : "Ошибка публикации"}
          </h2>
          <div className="flex justify-center gap-6 text-sm">
            <div>
              <span className="text-green-400 font-semibold text-lg">{successCount}</span>
              <p className="text-muted-foreground">Опубликовано</p>
            </div>
            {errorCount > 0 && (
              <div>
                <span className="text-red-400 font-semibold text-lg">{errorCount}</span>
                <p className="text-muted-foreground">Ошибок</p>
              </div>
            )}
          </div>
        </div>

        {taskStatus.data?.results && (
          <div className="space-y-2">
            {taskStatus.data.results.map((r: any, i: number) => (
              <div
                key={i}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  r.status === "ok" ? "border-green-800 bg-green-950/30" : "border-red-800 bg-red-950/30"
                }`}
              >
                <span className="text-sm">Пост {i + 1}</span>
                {r.status === "ok" ? (
                  <span className="flex items-center gap-2">
                    {r.vk_post_id && groupId ? (
                      <a
                        href={`https://vk.com/wall-${groupId}_${r.vk_post_id}`}
                        target="_blank"
                        rel="noopener"
                        className="text-sm text-accent hover:underline"
                      >
                        VK: {r.vk_post_id}
                      </a>
                    ) : (
                      <span className="text-sm text-blue-400">Telegram ✓</span>
                    )}
                    {r.error && (
                      <span className="text-xs text-yellow-500" title="Не все медиа удалось загрузить">
                        ⚠ {r.error}
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-sm text-red-400">{r.error}</span>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-center">
          <Button onClick={onDone}>Готово</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Предпросмотр</h2>
        <p className="text-sm text-muted-foreground">
          Проверьте посты перед публикацией. Можно редактировать текст и порядок.
        </p>
      </div>

      <div className="space-y-4">
        {posts.map((post, i) => (
          <PostCard
            key={post.id}
            post={post}
            index={i}
            total={posts.length}
            onUpdate={updatePost}
            onRemove={removePost}
            onMoveUp={moveUp}
            onMoveDown={moveDown}
          />
        ))}
      </div>

      {isRunning && progress && (
        <div className="bg-muted/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <Loader2 className="w-4 h-4 animate-spin text-accent" />
              <span className="text-sm font-medium">
                {progress.stage === "downloading_media" && "Загрузка медиа..."}
                {progress.stage === "uploading_media" && "Загрузка в VK..."}
                {progress.stage === "creating_posts" && "Создание постов..."}
                {progress.stage === "done" && "Завершение..."}
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={handleCancel} disabled={cancelTask.isPending}>
              <Ban className="w-3.5 h-3.5 mr-1" /> Отменить
            </Button>
          </div>
          <div className="w-full bg-background rounded-full h-2">
            <div
              className="bg-accent h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {progress.current} / {progress.total}
            {progress.retries ? ` · повторных попыток: ${progress.retries}` : ""}
          </p>
        </div>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} disabled={isRunning}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Назад
        </Button>
        <Button
          onClick={handlePublish}
          disabled={isRunning || submitting || posts.length === 0}
        >
          {isRunning || submitting ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Публикация...</>
          ) : (
            `Опубликовать (${posts.length})`
          )}
        </Button>
      </div>
    </div>
  );
}

export { Step3Preview };
