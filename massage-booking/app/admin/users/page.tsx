import Link from "next/link";
import { redirect } from "next/navigation";
import { listUsers } from "@/app/actions/users";
import { GENDER_LABEL, ROLE_LABEL, isRole, isGender } from "@/lib/roles";
import { getCurrentUser, nextCookieJar } from "@/lib/session";
import { UserBar } from "../../UserBar";
import { AddUserDialog } from "../AddUserDialog";
import { UserActions } from "./UserActions";

export const metadata = {
  title: "ユーザー管理 | マッサージ室の予約",
};

/** 管理者: ユーザー管理（AC-17 / A-4） */
export default async function AdminUsersPage() {
  // アカウント情報を扱う画面なので、管理者以外は入れない（F-8 / 要件 Q-7）
  const user = await getCurrentUser(await nextCookieJar());
  if (!user) redirect("/login?next=%2Fadmin%2Fusers");
  if (user.role !== "admin") redirect("/?denied=admin");

  const users = await listUsers();

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">ユーザー管理</h1>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/admin" className="text-sm underline underline-offset-4">
            予約状況へ戻る
          </Link>
          <Link href="/admin/stats" className="text-sm underline underline-offset-4">
            集計
          </Link>
          <UserBar user={user} />
        </div>
      </header>

      <div className="mb-6 flex justify-end">
        <AddUserDialog />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {/*
                「状態」列は置かない。削除は論理削除（User.active を false にする）だけなので、
                「無効」になるのは削除したときに限られ、操作列の「有効に戻す」ボタンと同じことを
                二重に言うことになる。削除済みの人は行を薄くして見分ける。
              */}
              {["氏名", "メールアドレス", "権限", "性別", "利用実績", "操作"].map((label) => (
                <th
                  key={label}
                  className="border border-black/10 px-3 py-2 text-left dark:border-white/15"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
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
                <td className="border border-black/10 px-3 py-2 dark:border-white/15">{u.name}</td>
                <td className="border border-black/10 px-3 py-2 dark:border-white/15">{u.email}</td>
                <td className="border border-black/10 px-3 py-2 dark:border-white/15">
                  {isRole(u.role) ? ROLE_LABEL[u.role] : u.role}
                </td>
                <td className="border border-black/10 px-3 py-2 dark:border-white/15">
                  {isGender(u.gender) ? GENDER_LABEL[u.gender] : u.gender}
                </td>
                <td className="border border-black/10 px-3 py-2 tabular-nums dark:border-white/15">
                  {u.history.reservations + u.history.assignments + u.history.others === 0 ? (
                    <span className="text-black/40 dark:text-white/40">なし</span>
                  ) : (
                    [
                      u.history.reservations > 0 && `予約 ${u.history.reservations}`,
                      u.history.assignments > 0 && `担当 ${u.history.assignments}`,
                      u.history.others > 0 && `その他 ${u.history.others}`,
                    ]
                      .filter(Boolean)
                      .join(" / ")
                  )}
                </td>
                <td className="border border-black/10 px-3 py-2 dark:border-white/15">
                  <UserActions user={u} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
