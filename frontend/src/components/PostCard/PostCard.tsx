import { MediaCard, type MediaItem } from "@/components/MediaCard/MediaCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChevronUp, ChevronDown, X } from "lucide-react";

interface PostCardProps {
  post: {
    id: string;
    post_type: string;
    scheduled_at: string;
    media_items: MediaItem[];
    post_text: string;
    source_urls: string[];
  };
  index: number;
  total: number;
  onUpdate: (id: string, changes: Record<string, unknown>) => void;
  onRemove: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
}

const TYPE_VARIANT: Record<string, "art" | "fursuit" | "video"> = {
  art: "art",
  fursuit: "fursuit",
  video: "video",
};

function PostCard({ post, index, total, onUpdate, onRemove, onMoveUp, onMoveDown }: PostCardProps) {
  const dt = post.scheduled_at ? new Date(post.scheduled_at) : null;

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Badge variant={TYPE_VARIANT[post.post_type] || "default"}>
            {post.post_type}
          </Badge>
          {dt && (
            <span className="text-sm text-muted-foreground">
              {dt.toLocaleDateString("ru-RU")} {dt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            ({post.media_items.filter((m) => m.selected).length} медиа)
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onMoveUp(post.id)} disabled={index === 0}>
            <ChevronUp className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onMoveDown(post.id)} disabled={index === total - 1}>
            <ChevronDown className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-300" onClick={() => onRemove(post.id)}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {post.media_items.map((m) => (
          <MediaCard
            key={m.id}
            item={m}
            compact
            onToggle={(id) => {
              const updated = post.media_items.map((mi) =>
                mi.id === id ? { ...mi, selected: !mi.selected } : mi
              );
              onUpdate(post.id, { media_items: updated });
            }}
          />
        ))}
      </div>

      <Textarea
        value={post.post_text}
        onChange={(e) => onUpdate(post.id, { post_text: e.target.value })}
        rows={3}
        className="text-sm"
      />
    </div>
  );
}

export { PostCard };
