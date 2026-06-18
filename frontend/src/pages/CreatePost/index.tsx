import { useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Step1Sources, type SourceItem } from "./Step1Sources";
import { Step2Schedule } from "./Step2Schedule";
import { Step3Preview } from "./Step3Preview";
import { Badge } from "@/components/ui/badge";
import type { MediaItem } from "@/components/MediaCard/MediaCard";

interface PreviewPost {
  id: string;
  post_type: string;
  scheduled_at: string;
  media_items: MediaItem[];
  post_text: string;
  source_urls: string[];
}

const TYPE_LABELS: Record<string, string> = { art: "Art", fursuit: "Fursuit", video: "Video" };
const TYPE_VARIANT: Record<string, "art" | "fursuit" | "video"> = { art: "art", fursuit: "fursuit", video: "video" };

function CreatePost() {
  const { type } = useParams<{ type: string }>();
  const navigate = useNavigate();
  const postType = type || "art";

  const [step, setStep] = useState(1);
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [localFiles, setLocalFiles] = useState<File[]>([]);
  const [localPreviews, setLocalPreviews] = useState<{ file: File; url: string }[]>([]);
  const [startDate, setStartDate] = useState("");
  const [timeSlots, setTimeSlots] = useState<string[]>([]);
  const [timezone, setTimezone] = useState("");
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const [previewPosts, setPreviewPosts] = useState<PreviewPost[]>([]);

  const allMediaMap = useCallback(() => {
    const map = new Map<string, MediaItem>();
    for (const s of sources) {
      for (const m of s.mediaItems) {
        map.set(m.id, m);
      }
    }
    localFiles.forEach((f, i) => {
      map.set(`local_${i}`, {
        id: `local_${i}`,
        type: f.type.startsWith("video/") ? "video" : "photo",
        thumbnail_url: localPreviews[i]?.url || "",
        original_url: localPreviews[i]?.url || "",
        selected: true,
        source_tool: "local",
      });
    });
    return map;
  }, [sources, localFiles, localPreviews]);

  const handlePreviewResult = useCallback((rawPosts: any[]) => {
    const mediaMap = allMediaMap();
    const mapped: PreviewPost[] = rawPosts.map((p) => ({
      id: p.id,
      post_type: p.post_type,
      scheduled_at: p.scheduled_at,
      post_text: p.post_text,
      source_urls: p.source_urls,
      media_items: (p.media_item_ids || []).map((id: string) => mediaMap.get(id)).filter(Boolean) as MediaItem[],
    }));
    setPreviewPosts(mapped);
  }, [allMediaMap]);

  const handleLocalFilesChange = useCallback((files: File[], previews: { file: File; url: string }[]) => {
    setLocalFiles(files);
    setLocalPreviews(previews);
  }, []);

  const handleDone = useCallback(() => {
    setSources([]);
    setLocalFiles([]);
    setLocalPreviews([]);
    setPreviewPosts([]);
    setSessionKey(null);
    setStep(1);
    navigate("/posts/calendar");
  }, [navigate]);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">Создать пост</h1>
        <Badge variant={TYPE_VARIANT[postType] || "default"} className="text-sm">
          {TYPE_LABELS[postType] || postType}
        </Badge>
      </div>

      <div className="flex items-center gap-1 sm:gap-2 mb-6 sm:mb-8 overflow-x-auto">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-medium transition-colors ${
              step >= s ? "bg-accent text-white" : "bg-muted text-muted-foreground"
            }`}>{s}</div>
            <span className={`text-xs sm:text-sm hidden sm:inline ${step >= s ? "text-foreground" : "text-muted-foreground"}`}>
              {s === 1 ? "Источники" : s === 2 ? "Планирование" : "Предпросмотр"}
            </span>
            {s < 3 && <div className={`w-6 sm:w-12 h-px ${step > s ? "bg-accent" : "bg-border"}`} />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <Step1Sources
          sources={sources}
          localFiles={localFiles}
          localPreviews={localPreviews}
          onSourcesChange={setSources}
          onLocalFilesChange={handleLocalFilesChange}
          onNext={() => setStep(2)}
        />
      )}

      {step === 2 && (
        <Step2Schedule
          sources={sources}
          localFiles={localFiles}
          postType={postType}
          startDate={startDate}
          timeSlots={timeSlots}
          timezone={timezone}
          sessionKey={sessionKey}
          onStartDateChange={setStartDate}
          onTimeSlotsChange={setTimeSlots}
          onTimezoneChange={setTimezone}
          onSessionKeyChange={setSessionKey}
          onPreviewResult={handlePreviewResult}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}

      {step === 3 && (
        <Step3Preview
          posts={previewPosts}
          onPostsChange={setPreviewPosts}
          onBack={() => setStep(2)}
          onDone={handleDone}
        />
      )}
    </div>
  );
}

export default CreatePost;
