/**
 * Slack DM の文面。中山さんが共有した社内Botのメッセージ例（絵文字・ボット名乗り・リンクの見せ方）を参考にした。
 */

type ReservationInfo = {
  date: string; // "2026-09-10"
  startTime: string; // "09:00"
  endTime: string; // "09:30"
  treatmentMin: number;
  bedName: string;
};

export function reservedMessageForTherapist(info: ReservationInfo & { userName: string }): string {
  return [
    ":relaxed: マッサージ室予約Bot です！",
    ":sparkles: 新しい予約が入りました",
    `日時: ${info.date} ${info.startTime}〜${info.endTime}（施術 ${info.treatmentMin} 分）`,
    `ベッド: ${info.bedName}`,
    `利用者: ${info.userName}`,
  ].join("\n");
}

export function cancelledMessageForTherapist(info: ReservationInfo & { userName: string }): string {
  return [
    ":no_entry_sign: マッサージ室予約Bot です",
    "予約がキャンセルされました",
    `日時: ${info.date} ${info.startTime}〜${info.endTime}`,
    `ベッド: ${info.bedName}`,
    `利用者: ${info.userName}`,
  ].join("\n");
}

type DailyDigestItemForUser = {
  startTime: string;
  endTime: string;
  bedName: string;
  therapistName: string;
};

/** 利用者向け: その日の自分の予約をまとめて1通で知らせる（朝9時の一括通知） */
export function dailyDigestMessageForUser(input: {
  items: DailyDigestItemForUser[];
  cancelUrl: string;
}): string {
  const lines = [
    ":bell: マッサージ室予約Bot です！",
    "本日のご予約をお知らせします",
    "",
    ...input.items.map(
      (i) => `・${i.startTime}〜${i.endTime}（${i.bedName} / 施術者 ${i.therapistName}）`,
    ),
    "",
    "キャンセルする場合はこちらから :point_down:",
    `:link: ${input.cancelUrl}`,
    "※施術開始の2時間前を過ぎるとキャンセルできません",
  ];

  return lines.join("\n");
}

type DailyDigestItemForTherapist = {
  startTime: string;
  endTime: string;
  bedName: string;
  userName: string;
};

/** マッサージ師向け: その日担当する予約をすべて1通にまとめて知らせる */
export function dailyDigestMessageForTherapist(input: { items: DailyDigestItemForTherapist[] }): string {
  const lines = [
    ":alarm_clock: マッサージ室予約Bot です！",
    "本日の担当予約をお知らせします",
    "",
    ...input.items.map((i) => `・${i.startTime}〜${i.endTime}（${i.bedName} / 利用者 ${i.userName}）`),
  ];
  return lines.join("\n");
}
