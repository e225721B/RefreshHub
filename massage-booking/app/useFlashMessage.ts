"use client";

import { useEffect, useState } from "react";

export type FlashMessage = { ok: boolean; text: string; id: number };

/** 右上に 3 秒表示してフェードアウトするフラッシュメッセージ（トースト）。 */
export function useFlashMessage() {
  const [message, setMessage] = useState<FlashMessage | null>(null);

  function showMessage(ok: boolean, text: string) {
    setMessage({ ok, text, id: Date.now() });
  }

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 3300);
    return () => clearTimeout(timer);
  }, [message]);

  return { message, showMessage, clearMessage: () => setMessage(null) };
}
