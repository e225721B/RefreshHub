"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { login, type LoginState } from "./actions";

/** 入力欄の左に置く小さなアイコン */
function FieldIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-rose-400/80 dark:text-rose-300/70">
      {children}
    </span>
  );
}

function SubmitButton() {
  // 送信中かどうかを受け取り、二重送信を防ぐ
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="group relative mt-2 w-full overflow-hidden rounded-2xl bg-gradient-to-r from-rose-400 via-rose-400 to-orange-300 px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-rose-500/25 transition hover:shadow-xl hover:shadow-rose-500/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="flex items-center justify-center gap-2">
        {pending ? (
          <>
            <svg className="size-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            ログインしています…
          </>
        ) : (
          <>
            ログイン
            <svg className="size-5 transition group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 12h13m0 0-5-5m5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </>
        )}
      </span>
    </button>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [state, formAction] = useActionState<LoginState, FormData>(login, { error: null });
  const [showPassword, setShowPassword] = useState(false);

  const inputClass =
    "w-full rounded-2xl border border-rose-200/70 bg-white/80 py-3.5 pl-12 pr-4 text-[15px] text-stone-800 placeholder:text-stone-400 shadow-sm transition focus:border-rose-300 focus:bg-white focus:outline-none focus:ring-4 focus:ring-rose-200/50 dark:border-white/15 dark:bg-white/5 dark:text-stone-100 dark:placeholder:text-stone-500 dark:focus:border-rose-300/40 dark:focus:bg-white/10 dark:focus:ring-rose-300/15";

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />

      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="text-sm font-medium text-stone-700 dark:text-stone-200">
          メールアドレス
        </label>
        <div className="relative">
          <FieldIcon>
            <svg className="size-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="3" stroke="currentColor" strokeWidth="1.7" />
              <path d="m4 8 7.1 4.6a2 2 0 0 0 2.2 0L20.5 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </FieldIcon>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoFocus
            autoComplete="username"
            placeholder="user1@example.com"
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="password" className="text-sm font-medium text-stone-700 dark:text-stone-200">
          パスワード
        </label>
        <div className="relative">
          <FieldIcon>
            <svg className="size-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="4" y="10" width="16" height="10" rx="3" stroke="currentColor" strokeWidth="1.7" />
              <path d="M8 10V7.5a4 4 0 0 1 8 0V10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </FieldIcon>
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            placeholder="••••••••"
            className={`${inputClass} pr-14`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "パスワードを隠す" : "パスワードを表示する"}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-stone-400 transition hover:bg-rose-50 hover:text-rose-500 focus-visible:outline-2 focus-visible:outline-rose-400 dark:hover:bg-white/10"
          >
            {showPassword ? (
              <svg className="size-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M3 3l18 18M10.6 10.7a2 2 0 0 0 2.8 2.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                <path d="M6.5 6.6C4.6 7.9 3.2 9.8 2.5 12c1.4 4 5.2 6.5 9.5 6.5 1.6 0 3.1-.3 4.4-1M17.9 17c1.7-1.3 3-3 3.6-5-1.4-4-5.2-6.5-9.5-6.5-.8 0-1.6.1-2.3.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            ) : (
              <svg className="size-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M2.5 12C3.9 8 7.7 5.5 12 5.5S20.1 8 21.5 12c-1.4 4-5.2 6.5-9.5 6.5S3.9 16 2.5 12Z" stroke="currentColor" strokeWidth="1.7" />
                <circle cx="12" cy="12" r="2.8" stroke="currentColor" strokeWidth="1.7" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {state.error && (
        <p
          role="alert"
          className="flex items-start gap-2.5 rounded-2xl border border-rose-300/60 bg-rose-50/90 px-4 py-3 text-sm text-rose-800 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-200"
        >
          <svg className="mt-0.5 size-5 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
            <path d="M12 7.5v5.5m0 3.2v.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          </svg>
          {state.error}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
