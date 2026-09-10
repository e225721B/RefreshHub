// 権限（role）と性別（gender）の選択肢とラベル。
// 画面（select の選択肢・一覧の表示）と Server Action（入力値の検証）の両方から使うため、
// どちらか片方に書かず、ここ 1 か所に持たせる。

import type { Gender } from "@/lib/slots";

export const ROLES = ["user", "therapist", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  user: "利用者",
  therapist: "マッサージ師",
  admin: "管理者",
};

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export const GENDERS = ["female", "male"] as const;

export const GENDER_LABEL: Record<Gender, string> = {
  female: "女性",
  male: "男性",
};

export function isGender(value: string): value is Gender {
  return (GENDERS as readonly string[]).includes(value);
}

/**
 * ログイン直後の行き先。管理者は自分で予約を取る立場ではないため、
 * 予約画面ではなく管理画面（予約状況）に着地させる。
 */
export function landingFor(role: string): string {
  return role === "admin" ? "/admin" : "/";
}
