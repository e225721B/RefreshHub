"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/therapist", label: "シフト一覧" },
  { href: "/therapist/today", label: "自分の担当する予約" },
  { href: "/therapist/absence", label: "休み申請" },
] as const;

export function TherapistTabs() {
  const pathname = usePathname();

  return (
    <nav className="grid w-full grid-cols-3 gap-2">
      {TABS.map((tab) => {
        const active = tab.href === "/therapist" ? pathname === "/therapist" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-lg px-3.5 py-2 text-center text-sm transition ${
              active
                ? "bg-rose-500 text-white shadow-sm"
                : "text-stone-600 hover:bg-black/5 dark:text-stone-300 dark:hover:bg-white/10"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
