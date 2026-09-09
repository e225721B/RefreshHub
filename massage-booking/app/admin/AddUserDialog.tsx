"use client";

// 「ユーザーを追加」ボタンとモーダル（AC-17 / A-5）。
// 予約状況の画面（/admin）とユーザー管理の画面（/admin/users）の両方に置くため、
// 画面側ではなくこのコンポーネントにボタンごと持たせている。

import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createUser, type CreateUserState } from "@/app/actions/users";
import { generatePassword, PASSWORD_MIN_LENGTH } from "@/lib/generate-password";
import { GENDERS, GENDER_LABEL, ROLES, ROLE_LABEL, ROLE_NOTE, type Role } from "@/lib/roles";

const INITIAL: CreateUserState = { error: null, created: null };

const inputClass =
  "w-full rounded-2xl border border-rose-200/70 bg-rose-50/40 px-4 py-3 text-[15px] text-stone-800 placeholder:text-stone-400 shadow-sm transition focus:border-rose-300 focus:bg-white focus:outline-none focus:ring-4 focus:ring-rose-200/50 dark:border-white/15 dark:bg-white/5 dark:text-stone-100 dark:placeholder:text-stone-500 dark:focus:border-rose-300/40 dark:focus:bg-white/10 dark:focus:ring-rose-300/15";

const labelClass = "text-sm font-medium text-stone-700 dark:text-stone-200";

function SubmitButton() {
  // 送信中は押せなくして、同じメールアドレスで二重に登録されるのを防ぐ
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-gradient-to-r from-rose-400 to-orange-300 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/25 transition hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "追加しています…" : "追加する"}
    </button>
  );
}

/** 登録できたときに出す確認パネル。初期パスワードを見られるのはこの 1 回だけ */
function CreatedPanel({
  created,
  onAddMore,
  onClose,
}: {
  created: NonNullable<CreateUserState["created"]>;
  onAddMore: () => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div>
      <h2 className="text-xl font-bold tracking-tight text-stone-800 dark:text-stone-50">
        {created.name} さんを追加しました
      </h2>
      <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
        このアカウントで今すぐログインできます。
      </p>

      <dl className="mt-5 space-y-2 rounded-2xl bg-rose-50/60 px-4 py-3 text-sm dark:bg-white/5">
        <div className="flex gap-3">
          <dt className="w-28 shrink-0 text-stone-500 dark:text-stone-400">メールアドレス</dt>
          <dd className="break-all font-medium text-stone-800 dark:text-stone-100">
            {created.email}
          </dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-28 shrink-0 text-stone-500 dark:text-stone-400">権限</dt>
          <dd className="font-medium text-stone-800 dark:text-stone-100">
            {ROLE_LABEL[created.role]}
          </dd>
        </div>
      </dl>

      <div className="mt-4">
        <p className={labelClass}>初期パスワード</p>
        <div className="mt-2 flex items-center gap-2">
          <code className="flex-1 rounded-2xl border border-rose-200/70 bg-white px-4 py-3 font-mono text-[15px] tracking-wide text-stone-800 dark:border-white/15 dark:bg-white/5 dark:text-stone-100">
            {created.password}
          </code>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(created.password).then(
                () => setCopied(true),
                () => setCopied(false),
              );
            }}
            className="rounded-2xl border border-rose-200/70 px-4 py-3 text-sm font-medium text-stone-700 transition hover:bg-rose-50 dark:border-white/15 dark:text-stone-200 dark:hover:bg-white/10"
          >
            {copied ? "コピーしました" : "コピー"}
          </button>
        </div>
        <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900 dark:bg-amber-400/10 dark:text-amber-200">
          パスワードはハッシュ化して保存され、平文は残りません。
          <strong>この画面を閉じると二度と表示できません。</strong>
          本人に手渡し／DM で伝えてください。
        </p>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onAddMore}
          className="rounded-full border border-stone-300 px-5 py-2.5 text-sm font-medium text-stone-700 transition hover:bg-stone-50 dark:border-white/20 dark:text-stone-200 dark:hover:bg-white/10"
        >
          続けて追加
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-gradient-to-r from-rose-400 to-orange-300 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/25 transition hover:shadow-xl"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}

export function AddUserDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<CreateUserState, FormData>(createUser, INITIAL);
  const [role, setRole] = useState<Role>("user");
  const [password, setPassword] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  // useActionState の結果は次の送信まで残るため、「もう確認した登録」を覚えておき、
  // 確認済みなら完了パネルではなく空のフォームを出す（続けて追加できるようにするため）。
  const [acknowledged, setAcknowledged] = useState<string | null>(null);
  const created = state.created && state.created.email !== acknowledged ? state.created : null;

  // Esc で閉じられるようにする
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // close() は毎回作り直されるため依存配列を置かない（開いている間だけ登録し直す）
  });

  /** ボタンから開く。初期パスワードはこのとき 1 つ用意する（管理者が自分で考えなくてよいように）。
   * サーバ側では生成しないので、表示のずれ（ハイドレーション不一致）も起きない。 */
  function openDialog() {
    setPassword(generatePassword());
    setOpen(true);
  }

  /** 入力欄を空に戻し、初期パスワードを引き直す */
  function resetForm() {
    setAcknowledged(state.created?.email ?? null);
    setRole("user");
    setPassword(generatePassword());
    formRef.current?.reset();
  }

  /** 閉じるときも次に開いたときのために空に戻す */
  function close() {
    resetForm();
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-rose-400 to-orange-300 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/25 transition hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400 active:scale-[0.99]"
      >
        <svg className="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
        ユーザーを追加
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-rose-950/30 p-4 backdrop-blur-sm sm:items-center"
          onClick={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-user-title"
            onClick={(e) => e.stopPropagation()}
            className="my-8 w-full max-w-lg rounded-[1.75rem] border border-white/70 bg-white p-8 text-left shadow-2xl shadow-rose-950/10 dark:border-white/10 dark:bg-stone-900"
          >
            {created ? (
              <CreatedPanel created={created} onAddMore={resetForm} onClose={close} />
            ) : (
              <form ref={formRef} action={formAction} className="flex flex-col gap-5">
                <div>
                  <h2
                    id="add-user-title"
                    className="text-xl font-bold tracking-tight text-stone-800 dark:text-stone-50"
                  >
                    ユーザーを追加
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-stone-500 dark:text-stone-400">
                    メールアドレスとパスワードを登録します。自己登録はできないため、アカウントは管理者がここで作ります。
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="user-name" className={labelClass}>
                    氏名
                  </label>
                  <input
                    id="user-name"
                    name="name"
                    type="text"
                    required
                    autoFocus
                    placeholder="山田 次郎"
                    className={inputClass}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="user-email" className={labelClass}>
                    メールアドレス
                  </label>
                  <input
                    id="user-email"
                    name="email"
                    type="email"
                    required
                    autoComplete="off"
                    placeholder="jiro.yamada@example.com"
                    className={inputClass}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="user-role" className={labelClass}>
                    権限
                  </label>
                  <select
                    id="user-role"
                    name="role"
                    value={role}
                    onChange={(e) => setRole(e.target.value as Role)}
                    className={inputClass}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-stone-500 dark:text-stone-400">{ROLE_NOTE[role]}</p>
                </div>

                {/* 性別は Therapist に必須。利用者が「担当の性別」で絞り込むために使う */}
                {role === "therapist" && (
                  <div className="flex flex-col gap-2">
                    <label htmlFor="user-gender" className={labelClass}>
                      性別
                    </label>
                    <select
                      id="user-gender"
                      name="gender"
                      defaultValue="female"
                      className={inputClass}
                    >
                      {GENDERS.map((g) => (
                        <option key={g} value={g}>
                          {GENDER_LABEL[g]}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-stone-500 dark:text-stone-400">
                      利用者が予約画面で担当の性別を絞り込むために使います。
                    </p>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <label htmlFor="user-password" className={labelClass}>
                    初期パスワード
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="user-password"
                      name="password"
                      type="text"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="off"
                      className={`${inputClass} font-mono tracking-wide`}
                    />
                    <button
                      type="button"
                      onClick={() => setPassword(generatePassword())}
                      className="shrink-0 rounded-2xl border border-rose-200/70 px-4 py-3 text-sm font-medium text-stone-700 transition hover:bg-rose-50 dark:border-white/15 dark:text-stone-200 dark:hover:bg-white/10"
                    >
                      自動生成
                    </button>
                  </div>
                  <p className="rounded-2xl bg-rose-50/60 px-4 py-3 text-xs leading-relaxed text-stone-600 dark:bg-white/5 dark:text-stone-400">
                    {PASSWORD_MIN_LENGTH} 文字以上・英字と数字を含む。
                    <br />
                    登録するとハッシュ化して保存され、平文は保持されません。
                  </p>
                </div>

                {state.error && (
                  <p
                    role="alert"
                    className="rounded-2xl border border-rose-300/60 bg-rose-50/90 px-4 py-3 text-sm text-rose-800 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-200"
                  >
                    {state.error}
                  </p>
                )}

                <div className="mt-1 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-full border border-stone-300 px-5 py-2.5 text-sm font-medium text-stone-700 transition hover:bg-stone-50 dark:border-white/20 dark:text-stone-200 dark:hover:bg-white/10"
                  >
                    やめる
                  </button>
                  <SubmitButton />
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
