import { useScheduledPosts, useDeletePost, useUpdatePost } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { X, Pencil, Trash2, ExternalLink, Check } from "lucide-react";
import { useState } from "react";

interface DayDetailProps {
  date: string;
  onClose: () => void;
}

const TYPE_VARIANT: Record<string, "art" | "fursuit" | "video"> = {
  art: "art", fursuit: "fursuit", video: "video",
};

function DayDetail({ date, onClose }: DayDetailProps) {
  const { data: posts, isLoading } = useScheduledPosts();
  const deletePost = useDeletePost();
  const updatePost = useUpdatePost();
  const { addToast } = useToast();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [editDate, setEditDate] = useState("");

  const dayPosts = (posts || []).filter((p: any) => {
    if (!p.scheduled_at) return false;
    return p.scheduled_at.startsWith(date);
  }).sort((a: any, b: any) => (a.scheduled_at || "").localeCompare(b.scheduled_at || ""));

  const handleDelete = async (vkPostId: number) => {
    try {
      await deletePost.mutateAsync(vkPostId);
      addToast({ title: "Удалено", description: "Пост удалён", variant: "success" });
    } catch {
      addToast({ title: "Ошибка", description: "Не удалось удалить пост", variant: "destructive" });
    }
  };

  const startEdit = (post: any) => {
    setEditingId(post.vk_post_id);
    setEditText(post.post_text || "");
    setEditDate(post.scheduled_at ? post.scheduled_at.slice(0, 16) : "");
  };

  const saveEdit = async (vkPostId: number) => {
    try {
      await updatePost.mutateAsync({
        vkPostId,
        data: { post_text: editText, scheduled_at: editDate ? new Date(editDate).toISOString() : undefined },
      });
      setEditingId(null);
      addToast({ title: "Сохранено", description: "Пост обновлён", variant: "success" });
    } catch {
      addToast({ title: "Ошибка", description: "Не удалось обновить пост", variant: "destructive" });
    }
  };

  const displayDate = new Date(date + "T00:00:00").toLocaleDateString("ru-RU", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="w-96 border-l border-border bg-card min-h-[calc(100vh-57px)] p-4 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-sm capitalize">{displayDate}</h2>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Загрузка...</p>
      ) : dayPosts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Нет постов на этот день</p>
      ) : (
        <div className="space-y-3">
          {dayPosts.map((post: any) => {
            const isEditing = editingId === post.vk_post_id;
            const time = post.scheduled_at
              ? new Date(post.scheduled_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
              : "";

            return (
              <div key={post.vk_post_id || post.id} className="bg-background border border-border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{time}</span>
                    <Badge variant={TYPE_VARIANT[post.post_type] || "default"} className="text-[10px]">
                      {post.post_type}
                    </Badge>
                  </div>
                  <div className="flex gap-1">
                    {isEditing ? (
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => saveEdit(post.vk_post_id)}>
                        <Check className="w-3.5 h-3.5 text-green-400" />
                      </Button>
                    ) : (
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => startEdit(post)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400" onClick={() => handleDelete(post.vk_post_id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {post.media_attachments && post.media_attachments.length > 0 && (
                  <div className="flex gap-1">
                    {post.media_attachments.slice(0, 4).map((m: any, i: number) => (
                      <div key={i} className="w-12 h-12 rounded bg-muted flex items-center justify-center text-[10px] text-muted-foreground">
                        {m.type}
                      </div>
                    ))}
                  </div>
                )}

                {isEditing ? (
                  <div className="space-y-2">
                    <Input
                      type="datetime-local"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="text-xs h-8"
                    />
                    <Textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={3}
                      className="text-xs"
                    />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground line-clamp-3">{post.post_text}</p>
                )}

                {post.vk_post_id && (
                  <a
                    href={`https://vk.com/wall-${post.vk_post_id}`}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                  >
                    <ExternalLink className="w-3 h-3" />
                    VK
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { DayDetail };
