import Link from "next/link";
import { redirect } from "next/navigation";
import { listUsers } from "@/app/actions/users";
import { getUnreadMailboxCount } from "@/app/actions/mailbox";
import { GENDER_LABEL, ROLE_LABEL, ROLES, isRole, isGender } from "@/lib/roles";
import { getCurrentUserForRequest } from "@/lib/session";
import { MailboxButton } from "../../MailboxButton";
import { AddUserDialog } from "../AddUserDialog";
import { AdminHeader } from "../AdminHeader";
import { UserActions } from "./UserActions";

export const metadata = {
  title: "ユーザー管理 | マッサージ室の予約",
};

type Query = { q?: string; role?: string; page?: string; deleted?: string };

/** 一覧の列。hideOnMobile の列は狭い画面では出さず、氏名セルの中にまとめる */
const COLUMNS = [
  { label: "氏名", hideOnMobile: false },
  { label: "メールアドレス", hideOnMobile: true },
  { label: "権限", hideOnMobile: false },
  { label: "性別", hideOnMobile: true },
  { label: "利用回数", hideOnMobile: false },
  { label: "操作", hideOnMobile: false },
] as const;

/**
 * 絞り込みの状態は URL に持たせる（この画面は他に状態を持たないので JavaScript を足さずに済む）。
 * リンクを作るたびに、今の絞り込みを引き継ぎつつ一部だけ差し替える。
 */
function hrefWith(current: Query, changes: Partial<Query>): string {
  const merged = { ...current, ...changes };
  const params = new URLSearchParams();
  if (merged.q) params.set("q", merged.q);
  if (merged.role) params.set("role", merged.role);
  if (merged.deleted) params.set("deleted", merged.deleted);
  // ページは 1 のとき省く。絞り込みを変えたら 1 ページ目に戻す（呼び出し側で page: undefined を渡す）
  if (merged.page && merged.page !== "1") params.set("page", merged.page);
  const qs = params.toString();
  return qs ? `/admin/users?${qs}` : "/admin/users";
}

/** 管理者: ユーザー管理（AC-17 / A-4） */
export default async function AdminUsersPage({
  searchParams,
}: {
  // Next.js 16 では searchParams は Promise。await が必要
  searchParams: Promise<Query>;
}) {
  // アカウント情報を扱う画面なので、管理者以外は入れない（F-8 / 要件 Q-7）
  const user = await getCurrentUserForRequest();
  if (!user) redirect("/login?next=%2Fadmin%2Fusers");
  if (user.role !== "admin") redirect("/?denied=admin");
  const unreadMailboxCount = await getUnreadMailboxCount();

  const params = await searchParams;
  const keyword = params.q?.trim() ?? "";
  const roleFilter = isRole(params.role ?? "") ? params.role : undefined;
  const showDeleted = params.deleted === "1";

  const { users, total, page, pageCount, perPage } = await listUsers({
    includeDeleted: showDeleted,
    q: keyword,
    role: roleFilter,
    page: Number(params.page) || 1,
  });

  // 「15 件中 1〜20 件」の表示用
  const first = total === 0 ? 0 : (page - 1) * perPage + 1;
  const last = Math.min(page * perPage, total);
  const filtering = Boolean(keyword || roleFilter);

  // w-full は狭い画面だけ。body が flex で main が mx-auto のため、main は「中身の最大幅」に
  // 合わせて広がろうとする。その結果、表の min-w が overflow-x-auto の外へ漏れて
  // **ページ全体が画面幅より広くなり、ヘッダーやボタンが画面の外に出る**
  // （390px の画面で main が 544px になっていた）。w-full で幅を画面に固定し、
  // はみ出しは表の中だけで起こるようにする。
  // sm 以上は従来どおり w-auto に戻す（PC では main の幅が変わってしまうため）。
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:w-auto sm:px-6 sm:py-10">
      <AdminHeader
        title="ユーザー管理"
        current="/admin/users"
        user={user}
        actions={<MailboxButton initialUnreadCount={unreadMailboxCount} />}
      />

      {/* --- 絞り込み ---------------------------------------------------- */}
      <section className="mb-4 rounded-2xl border border-rose-200/70 bg-rose-50/50 px-4 py-4 sm:px-5 dark:border-white/10 dark:bg-white/5">
        <form action="/admin/users" className="flex flex-wrap items-center gap-3">
          {/* 狭い画面では検索欄を全幅にして、ボタンを次の行へ落とす */}
          <input
            type="search"
            name="q"
            defaultValue={keyword}
            placeholder="氏名・メールアドレスで検索"
            className="w-full rounded-2xl border border-rose-200/70 bg-white px-4 py-2.5 text-base text-stone-800 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-4 focus:ring-rose-200/50 sm:w-auto sm:min-w-56 sm:flex-1 sm:text-sm dark:border-white/15 dark:bg-white/5 dark:text-stone-100"
          />
          {/* 検索したときに、今の絞り込みを落とさないよう一緒に送る */}
          {roleFilter && <input type="hidden" name="role" value={roleFilter} />}
          {showDeleted && <input type="hidden" name="deleted" value="1" />}
          <button
            type="submit"
            className="flex-1 rounded-full bg-gradient-to-r from-rose-400 to-orange-300 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/25 transition hover:shadow-xl sm:flex-none"
          >
            検索
          </button>
          {keyword && (
            <Link
              href={hrefWith(params, { q: undefined, page: undefined })}
              className="text-sm underline underline-offset-4"
            >
              検索を解除
            </Link>
          )}
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {[{ value: undefined, label: "すべて" }, ...ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))].map(
            (option) => {
              const selected = roleFilter === option.value;
              return (
                <Link
                  key={option.label}
                  href={hrefWith(params, { role: option.value, page: undefined })}
                  aria-current={selected ? "true" : undefined}
                  className={
                    selected
                      ? "rounded-full bg-stone-800 px-3.5 py-2 text-xs font-semibold text-white dark:bg-white dark:text-stone-900"
                      : "rounded-full border border-black/15 px-3.5 py-2 text-xs transition hover:bg-black/[.04] dark:border-white/20 dark:hover:bg-white/10"
                  }
                >
                  {option.label}
                </Link>
              );
            },
          )}
        </div>
      </section>

      <div className="mb-4 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        {/*
          チェックボックスの見た目にしているが中身はリンク。
          JavaScript を足さずに URL だけで切り替えるため。
        */}
        <Link
          href={hrefWith(params, { deleted: showDeleted ? undefined : "1", page: undefined })}
          className="flex min-h-10 items-center gap-2 text-sm text-black/70 transition hover:text-black dark:text-white/70 dark:hover:text-white"
        >
          <span aria-hidden className="text-base leading-none">
            {showDeleted ? "☑" : "☐"}
          </span>
          削除済みも表示する
        </Link>
        <AddUserDialog />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {/*
                「状態」列は置かない。削除は論理削除（User.active を false にする）だけなので、
                「無効」になるのは削除したときに限られ、操作列の「有効に戻す」ボタンと
                同じことを二重に言うことになる。削除済みの人は行を薄くして見分ける。
              */}
              {/*
                6 列はスマートフォンの幅に入らない。列を削るのではなく、
                **メールアドレスと性別は狭い画面では氏名セルの中に畳む**（下の tbody 側を参照）。
                表を 2 つに分けず 1 つのままにするのは、集計画面から飛んでくる
                #user-<id> の目印（id）を 1 か所に保つため。
              */}
              {COLUMNS.map((column) => (
                <th
                  key={column.label}
                  className={`border border-black/10 px-2 py-2 text-left sm:px-3 dark:border-white/15 ${column.hideOnMobile ? "hidden md:table-cell" : ""}`}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="border border-black/10 px-3 py-8 text-center text-black/50 dark:border-white/15 dark:text-white/50"
                >
                  {filtering
                    ? "条件に合うユーザーがいません。検索や絞り込みを変えてみてください。"
                    : "表示できるユーザーがいません。"}
                </td>
              </tr>
            )}
            {users.map((u) => (
              // 集計画面（A-2）の一覧表から /admin/users#user-<id> で飛んでくる。
              // 飛んできた行だけ target: で色を付け、どの人を見に来たか分かるようにする
              <tr
                key={u.id}
                id={`user-${u.id}`}
                className={`scroll-mt-24 target:bg-amber-100/70 dark:target:bg-amber-400/15 ${
                  // 削除済み（active = false）の行は薄くして、有効な人と見分けられるようにする
                  u.active ? "" : "text-black/40 dark:text-white/40"
                }`}
              >
                <td className="border border-black/10 px-2 py-2 sm:px-3 dark:border-white/15">
                  {u.name}
                  {/* 狭い画面では独立した列を出せないぶん、ここに小さく添える */}
                  <span className="mt-0.5 block text-xs break-all text-black/50 md:hidden dark:text-white/50">
                    {u.email}
                    <span className="mx-1 text-black/25 dark:text-white/25">／</span>
                    {isGender(u.gender) ? GENDER_LABEL[u.gender] : u.gender}
                  </span>
                </td>
                <td className="hidden border border-black/10 px-2 py-2 break-all sm:px-3 md:table-cell dark:border-white/15">
                  {u.email}
                </td>
                <td className="border border-black/10 px-2 py-2 whitespace-nowrap sm:px-3 dark:border-white/15">
                  {isRole(u.role) ? ROLE_LABEL[u.role] : u.role}
                </td>
                <td className="hidden border border-black/10 px-2 py-2 sm:px-3 md:table-cell dark:border-white/15">
                  {isGender(u.gender) ? GENDER_LABEL[u.gender] : u.gender}
                </td>
                <td className="border border-black/10 px-2 py-2 whitespace-nowrap tabular-nums sm:px-3 dark:border-white/15">
                  {u.usageCount === 0 ? (
                    <span className="text-black/40 dark:text-white/40">0 回</span>
                  ) : (
                    `${u.usageCount} 回`
                  )}
                </td>
                <td className="border border-black/10 px-2 py-2 sm:px-3 dark:border-white/15">
                  <UserActions user={u} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* --- ページ送り --------------------------------------------------- */}
      <div className="mt-4 flex flex-col items-start gap-3 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <p className="text-black/60 dark:text-white/60">
          {total === 0 ? "0 件" : `${total} 件中 ${first}〜${last} 件`}
          {pageCount > 1 && (
            <span className="ml-2 text-black/40 dark:text-white/40">
              （{page} / {pageCount} ページ）
            </span>
          )}
        </p>

        {pageCount > 1 && (
          <div className="flex w-full items-center gap-2 sm:w-auto">
            {page > 1 ? (
              <Link
                href={hrefWith(params, { page: String(page - 1) })}
                className="flex-1 rounded-full border border-black/15 px-4 py-2 text-center transition hover:bg-black/[.04] sm:flex-none dark:border-white/20 dark:hover:bg-white/10"
              >
                ◁ 前へ
              </Link>
            ) : (
              <span className="flex-1 rounded-full border border-black/10 px-4 py-2 text-center text-black/30 sm:flex-none dark:border-white/10 dark:text-white/30">
                ◁ 前へ
              </span>
            )}
            {page < pageCount ? (
              <Link
                href={hrefWith(params, { page: String(page + 1) })}
                className="flex-1 rounded-full border border-black/15 px-4 py-2 text-center transition hover:bg-black/[.04] sm:flex-none dark:border-white/20 dark:hover:bg-white/10"
              >
                次へ ▷
              </Link>
            ) : (
              <span className="flex-1 rounded-full border border-black/10 px-4 py-2 text-center text-black/30 sm:flex-none dark:border-white/10 dark:text-white/30">
                次へ ▷
              </span>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
