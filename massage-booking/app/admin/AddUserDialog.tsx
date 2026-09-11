"use client";

// 「ユーザーを追加」ボタンとモーダル（AC-17 / A-5）。
// 予約状況の画面（/admin）とユーザー管理の画面（/admin/users）の両方に置くため、
// 画面側ではなくこのコンポーネントにボタンごと持たせている。

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createUser, type CreateUserState } from "@/app/actions/users";
import { GENDERS, GENDER_LABEL, ROLES, ROLE_LABEL, type Role } from "@/lib/roles";

const INITIAL: CreateUserState = { error: null, created: null };

// text-base（16px）→ sm 以上で 15px。iOS Safari は 16px 未満の入力欄にフォーカスすると
// 画面を勝手に拡大するため、狭い画面では 16px を下回らせない
const inputClass =
  "w-full rounded-2xl border border-rose-200/70 bg-rose-50/40 px-4 py-3 text-base sm:text-[15px] text-stone-800 placeholder:text-stone-400 shadow-sm transition focus:border-rose-300 focus:bg-white focus:outline-none focus:ring-4 focus:ring-rose-200/50 dark:border-white/15 dark:bg-white/5 dark:text-stone-100 dark:placeholder:text-stone-500 dark:focus:border-rose-300/40 dark:focus:bg-white/10 dark:focus:ring-rose-300/15";

const labelClass = "text-sm font-medium text-stone-700 dark:text-stone-200";

function SubmitButton() {
  // 送信中は押せなくして、同じメールアドレスで二重に登録されるのを防ぐ
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-full bg-gradient-to-r from-rose-400 to-orange-300 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/25 transition hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
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
  // 肩越しに覗かれないよう、初期パスワードは伏せ字で出す。必要なときだけ「表示」で開く
  const [revealed, setRevealed] = useState(false);

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
        {/* 狭い画面ではパスワードを 1 行使い、「表示 / コピー」を下の行へ回す */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code
            aria-label={revealed ? "初期パスワード" : "初期パスワード（伏せ字）"}
            className="w-full rounded-2xl border border-rose-200/70 bg-white px-4 py-3 font-mono text-[15px] break-all tracking-wide text-stone-800 sm:w-auto sm:flex-1 dark:border-white/15 dark:bg-white/5 dark:text-stone-100"
          >
            {revealed ? created.password : "*".repeat(created.password.length)}
          </code>
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-pressed={revealed}
            className="flex-1 rounded-2xl border border-rose-200/70 px-4 py-3 text-sm font-medium text-stone-700 transition hover:bg-rose-50 sm:flex-none dark:border-white/15 dark:text-stone-200 dark:hover:bg-white/10"
          >
            {revealed ? "隠す" : "表示"}
          </button>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(created.password).then(
                () => setCopied(true),
                () => setCopied(false),
              );
            }}
            className="flex-1 rounded-2xl border border-rose-200/70 px-4 py-3 text-sm font-medium text-stone-700 transition hover:bg-rose-50 sm:flex-none dark:border-white/15 dark:text-stone-200 dark:hover:bg-white/10"
          >
            {copied ? "コピーしました" : "コピー"}
          </button>
        </div>
        <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900 dark:bg-amber-400/10 dark:text-amber-200">
          パスワードはハッシュ化して保存され、平文は残りません。伏せ字のままでもコピーできます。
          <strong>この画面を閉じると二度と表示できません。</strong>
          本人に手渡し／DM で伝えてください。
        </p>
      </div>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
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

/** モーダルの中身。useActionState をここに置き、開き直すたびに作り直して結果を捨てる */
function AddUserForm({ onAddMore, onClose }: { onAddMore: () => void; onClose: () => void }) {
  const [state, formAction] = useActionState<CreateUserState, FormData>(createUser, INITIAL);
  const [role, setRole] = useState<Role>("user");
  const [gender, setGender] = useState("");

  if (state.created) {
    return <CreatedPanel created={state.created} onAddMore={onAddMore} onClose={onClose} />;
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
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
      </div>

      {/* 性別はどの権限でも必須。既定値を入れず、管理者に必ず選ばせる */}
      <div className="flex flex-col gap-2">
        <label htmlFor="user-gender" className={labelClass}>
          性別
        </label>
        <select
          id="user-gender"
          name="gender"
          required
          value={gender}
          onChange={(e) => setGender(e.target.value)}
          className={inputClass}
        >
          {/* 空の選択肢を残すことで、選ばずに送信すると required で止まる */}
          <option value="">選んでください</option>
          {GENDERS.map((g) => (
            <option key={g} value={g}>
              {GENDER_LABEL[g]}
            </option>
          ))}
        </select>
      </div>

      {state.error && (
        <p
          role="alert"
          className="rounded-2xl border border-rose-300/60 bg-rose-50/90 px-4 py-3 text-sm text-rose-800 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-200"
        >
          {state.error}
        </p>
      )}

      <div className="mt-1 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-stone-300 px-5 py-2.5 text-sm font-medium text-stone-700 transition hover:bg-stone-50 dark:border-white/20 dark:text-stone-200 dark:hover:bg-white/10"
        >
          やめる
        </button>
        <SubmitButton />
      </div>
    </form>
  );
}

export function AddUserDialog() {
  const [open, setOpen] = useState(false);
  // useActionState の結果（エラー・登録完了）は次の送信まで残るため、状態を消して回るのではなく
  // key を変えて中身ごと作り直す。閉じて開き直したときに前回のエラーや入力が残らない
  const [formKey, setFormKey] = useState(0);
  const reset = () => setFormKey((k) => k + 1);

  function close() {
    reset();
    setOpen(false);
  }

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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-rose-400 to-orange-300 px-5 py-2.5 sm:w-auto text-sm font-semibold text-white shadow-lg shadow-rose-500/25 transition hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400 active:scale-[0.99]"
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
            className="my-4 w-full max-w-lg rounded-[1.75rem] border border-white/70 bg-white p-5 text-left shadow-2xl shadow-rose-950/10 sm:my-8 sm:p-8 dark:border-white/10 dark:bg-stone-900"
          >
            <AddUserForm key={formKey} onAddMore={reset} onClose={close} />
          </div>
        </div>
      )}
    </>
  );
}
