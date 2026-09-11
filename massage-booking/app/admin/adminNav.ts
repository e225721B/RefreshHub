/** 管理者画面 3 つの画面切り替え。TopNav の subNav に渡す共通の並び。 */
export const ADMIN_PAGES = [
  { href: "/admin", label: "予約状況" },
  { href: "/admin/stats", label: "集計" },
  { href: "/admin/users", label: "ユーザー管理" },
] as const;
