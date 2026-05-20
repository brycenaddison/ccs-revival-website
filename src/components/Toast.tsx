import { useEffect } from "react";

interface ToastProps {
  message: string | null;
  type?: "success" | "error";
  onClose: () => void;
}

export function Toast({ message, type = "success", onClose }: ToastProps) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [message, onClose]);

  if (!message) return null;

  return (
    <div
      className={`fixed bottom-5 right-5 px-5 py-3 rounded-lg text-text-bright text-sm shadow-[0_4px_20px_rgba(0,0,0,0.5)] z-[999] ${
        type === "success" ? "bg-[var(--toast-success-bg)]" : "bg-[var(--toast-error-bg)]"
      }`}
    >
      {message}
    </div>
  );
}
