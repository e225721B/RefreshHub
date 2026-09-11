/**
 * Slack DM の文面。
 * 利用者向けは絵文字を使ってやわらかいトーンに、マッサージ師向けは業務連絡として簡潔にする
 * （2026-09-11 中山さんの指示）。
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
    "マッサージ室予約Bot",
    "新規予約のお知らせ",
    `日時: ${info.date} ${info.startTime}〜${info.endTime}（施術 ${info.treatmentMin} 分）`,
    `ベッド: ${info.bedName}`,
    `利用者: ${info.userName}`,
  ].join("\n");
}

export function cancelledMessageForTherapist(info: ReservationInfo & { userName: string }): string {
  return [
    "マッサージ室予約Bot",
    "予約キャンセルのお知らせ",
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
    "🌸 マッサージ室予約Bot です！",
    "今日のご予約をお知らせします ✨",
    "",
    ...input.items.map(
      (i) => `💆 ${i.startTime}〜${i.endTime}（🛏️ ${i.bedName} / 担当 ${i.therapistName}）`,
    ),
    "",
    "🙋 キャンセルする場合はこちらから",
    `🔗 ${input.cancelUrl}`,
    "⏰ 施術開始の2時間前を過ぎるとキャンセルできません",
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
    "マッサージ室予約Bot",
    "本日の担当予約",
    ...input.items.map((i) => `・${i.startTime}〜${i.endTime}（${i.bedName} / 利用者 ${i.userName}）`),
  ];
  return lines.join("\n");
}
