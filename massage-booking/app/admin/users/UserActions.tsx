"use client";

// 一覧 1 行ぶんの操作（削除 / 有効に戻す）。
//
// 削除は**論理削除**（User.active を false にするだけ）。行は消えないので取り消せるが、
// 押した人が「消えた」と誤解しないよう、確認のダイアログで何が起きるかを先に見せる。

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  deleteUser,
  reactivateUser,
  type UserActionState,
  type UserRow,
} from "@/app/actions/users";

const INITIAL: UserActionState = { error: null, message: null };

function SubmitButton({ label, className }: { label: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${className} disabled:opacity-60`}>
      {pending ? "処理中…" : label}
    </button>
  );
}

export function UserActions({ user }: { user: UserRow }) {
  const [confirming, setConfirming] = useState(false);
  const [deleteState, deleteAction] = useActionState(deleteUser, INITIAL);
  const [reactivateState, reactivateAction] = useActionState(reactivateUser, INITIAL);

  const result = deleteState.error ?? deleteState.message ?? reactivateState.error ?? reactivateState.message;
  const isError = Boolean(deleteState.error || reactivateState.error);

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap items-center gap-2">
        {!user.active && (
          <form action={reactivateAction}>
            <input type="hidden" name="userId" value={user.id} />
            <SubmitButton
              label="有効に戻す"
              className="rounded-full border border-black/15 px-3 py-1 text-xs transition hover:bg-black/[.04] dark:border-white/20 dark:hover:bg-white/10"
            />
          </form>
        )}

        {/* 削除済み（active = false）の人には出さない。押しても「すでに削除されています」で断られるだけ */}
        {user.active &&
          (user.canDelete ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="rounded-full border border-rose-300 px-3 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-50 dark:border-rose-400/40 dark:text-rose-300 dark:hover:bg-rose-500/10"
            >
              削除
            </button>
          ) : (
            <span className="text-xs text-black/40 dark:text-white/40">削除できません</span>
          ))}
      </div>

      {result && (
        <p
          className={`text-xs ${isError ? "text-rose-700 dark:text-rose-300" : "text-black/60 dark:text-white/60"}`}
        >
          {result}
        </p>
      )}

      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-rose-950/30 p-4 backdrop-blur-sm"
          onClick={() => setConfirming(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-[1.75rem] border border-white/70 bg-white p-7 text-left shadow-2xl dark:border-white/10 dark:bg-stone-900"
          >
            <h2 className="text-lg font-bold text-stone-800 dark:text-stone-50">
              {user.name} さんを削除しますか？
            </h2>
            <p className="mt-2 break-all text-sm text-stone-500 dark:text-stone-400">
              {user.email}
            </p>

            <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900 dark:bg-amber-400/10 dark:text-amber-200">
              <p>
                <strong>ログインできなくなり、空き枠の担当にも出なくなります。</strong>
                アカウントは一覧に残り、過去の予約と集計もそのままです
                （誰が使ったかを後から追えるようにするため）。あとから有効に戻せます。
              </p>
              {user.usageCount > 0 && (
                <p className="mt-1">
                  このユーザーには
                  <strong> 利用 {user.usageCount} 回</strong>
                  の記録があります。
                </p>
              )}
            </div>

            <form
              action={deleteAction}
              onSubmit={() => setConfirming(false)}
              className="mt-6 flex justify-end gap-3"
            >
              <input type="hidden" name="userId" value={user.id} />
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-full border border-stone-300 px-5 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50 dark:border-white/20 dark:text-stone-200 dark:hover:bg-white/10"
              >
                やめる
              </button>
              <SubmitButton
                label="削除する"
                className="rounded-full bg-rose-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-rose-600/25 transition hover:bg-rose-700"
              />
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
