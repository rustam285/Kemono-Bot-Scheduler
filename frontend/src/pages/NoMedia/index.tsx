import { useNoMediaPosts, useDeletePost } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Trash2, ExternalLink, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";

const TYPE_VARIANT: Record<string, "art" | "fursuit" | "video"> = {
  art: "art", fursuit: "fursuit", video: "video",
};

function NoMedia() {
  const { data: posts, isLoading } = useNoMediaPosts();
  const deletePost = useDeletePost();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const handleDelete = async (vkPostId: number) => {
    try {
      await deletePost.mutateAsync(vkPostId);
      addToast({ title: "Удалено", description: "Пост удалён", variant: "success" });
    } catch {
      addToast({ title: "Ошибка", description: "Не удалось удалить пост", variant: "destructive" });
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Посты без медиа</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Посты, к которым не прикреплены медиафайлы
          </p>
        </div>
        <Badge variant="destructive" className="text-sm">
          {posts?.length || 0}
        </Badge>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground text-center py-12">Загрузка...</div>
      ) : !posts || posts.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground text-lg mb-2">Все посты с медиа</p>
          <p className="text-sm text-muted-foreground">Нет постов без прикреплённых медиафайлов</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Дата</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Тип</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Текст</th>
                <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">VK</th>
                <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Действия</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post: any) => {
                const dt = post.scheduled_at ? new Date(post.scheduled_at) : null;
                return (
                  <tr key={post.vk_post_id || post.id} className="border-t border-border hover:bg-muted/20">
                    <td className="px-4 py-3 text-sm">
                      {dt && (
                        <>
                          <div>{dt.toLocaleDateString("ru-RU")}</div>
                          <div className="text-xs text-muted-foreground">
                            {dt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={TYPE_VARIANT[post.post_type] || "default"} className="text-xs">
                        {post.post_type}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground max-w-xs truncate">
                      {post.post_text}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {post.vk_post_id && (
                        <a
                          href={`https://vk.com/wall-${post.vk_post_id}`}
                          target="_blank"
                          rel="noopener"
                          className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Открыть
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => navigate("/create/art")}
                        >
                          <Plus className="w-3.5 h-3.5 mr-1" />
                          Добавить
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-400"
                          onClick={() => handleDelete(post.vk_post_id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default NoMedia;
