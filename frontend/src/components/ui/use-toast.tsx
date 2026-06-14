import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface ToasterToast {
  id: string;
  title?: string;
  description?: string;
  variant?: "default" | "destructive" | "success";
}

const ToastContext = React.createContext<{
  toasts: ToasterToast[];
  addToast: (toast: Omit<ToasterToast, "id">) => void;
  removeToast: (id: string) => void;
}>({ toasts: [], addToast: () => {}, removeToast: () => {} });

export function useToast() {
  return React.useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToasterToast[]>([]);

  const addToast = React.useCallback((toast: Omit<ToasterToast, "id">) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "rounded-lg border p-4 shadow-lg animate-in slide-in-from-bottom-5 min-w-[300px] max-w-[420px]",
              toast.variant === "destructive" && "border-red-800 bg-red-950 text-red-200",
              toast.variant === "success" && "border-green-800 bg-green-950 text-green-200",
              !toast.variant && "border-border bg-card text-card-foreground"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                {toast.title && <p className="font-semibold text-sm">{toast.title}</p>}
                {toast.description && <p className="text-sm opacity-80 mt-1">{toast.description}</p>}
              </div>
              <button onClick={() => removeToast(toast.id)} className="opacity-60 hover:opacity-100">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
