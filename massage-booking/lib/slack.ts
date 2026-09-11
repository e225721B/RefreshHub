/**
 * Slack DM 通知（AC-11 / AC-12 / AC-18、design.md D-2 の改訂 2026-09-10）。
 * 実際に送信する。失敗しても呼び出し元の処理（予約・キャンセル・リマインド送信）は止めないよう、
 * ここでは例外を投げずログに残すだけにする。
 */

const SLACK_API = "https://slack.com/api";

async function lookupSlackUserId(email: string, token: string): Promise<string | null> {
  const res = await fetch(
    `${SLACK_API}/users.lookupByEmail?email=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = await res.json();
  if (!data.ok) {
    console.error(`[slack] ユーザー検索に失敗しました (${email}):`, data.error);
    return null;
  }
  return data.user.id as string;
}

/** 任意のユーザー（利用者・マッサージ師どちらでも）の email 宛に Slack DM を送る */
export async function sendSlackDM(email: string, text: string): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    console.error("[slack] SLACK_BOT_TOKEN が未設定のため通知をスキップしました");
    return;
  }

  try {
    const userId = await lookupSlackUserId(email, token);
    if (!userId) return;

    const res = await fetch(`${SLACK_API}/chat.postMessage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ channel: userId, text }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error(`[slack] 送信に失敗しました (${email}):`, data.error);
    }
  } catch (err) {
    console.error(`[slack] 通知処理で例外が発生しました (${email}):`, err);
  }
}
