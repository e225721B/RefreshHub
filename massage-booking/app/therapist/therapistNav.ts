/** マッサージ師向け画面 3 つの画面切り替え。TopNav の subNav に渡す共通の並び。 */
export const THERAPIST_PAGES = [
  { href: "/therapist", label: "シフト一覧" },
  { href: "/therapist/today", label: "自分の担当する予約" },
  { href: "/therapist/absence", label: "休みの登録" },
] as const;
