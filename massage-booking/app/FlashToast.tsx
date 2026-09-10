import type { FlashMessage } from "./useFlashMessage";

export function FlashToast({ message }: { message: FlashMessage | null }) {
  if (!message) return null;
  return (
    <div
      key={message.id}
      role="status"
      className={`animate-toast-fade fixed top-4 right-4 z-50 max-w-sm rounded-lg border px-4 py-3 text-sm shadow-lg ${
        message.ok
          ? "border-green-600/30 bg-green-50 text-green-800 dark:border-green-500/30 dark:bg-green-950 dark:text-green-300"
          : "border-red-600/30 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-950 dark:text-red-300"
      }`}
    >
      {message.text}
    </div>
  );
}
