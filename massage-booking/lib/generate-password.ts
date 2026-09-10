// 初期パスワードの自動生成と、パスワードの強さの確認。
//
// モーダルの「自動生成」ボタン（ブラウザ）と Server Action の両方から呼ぶため、
// Node 固有の node:crypto ではなく、どちらの環境にもある Web Crypto を使う。
// ハッシュ化は lib/password.ts の担当で、ここでは平文を作るだけ。

/** 8 文字以上。管理者が口頭・DM で伝える前提なので、長すぎても写し間違いが増える */
export const PASSWORD_MIN_LENGTH = 8;

// 読み違えやすい文字（l / I / 1 / O / 0）は入れない。手渡しで伝えるため。
const LOWER = "abcdefghijkmnpqrstuvwxyz"; // pragma: allowlist secret
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // pragma: allowlist secret
const DIGIT = "23456789";

/** 0 以上 max 未満の整数。剰余で偏らないよう、範囲外の値は捨てて引き直す */
function randomInt(max: number): number {
  const limit = Math.floor(0xffffffff / max) * max;
  const buf = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(buf);
    value = buf[0];
  } while (value >= limit);
  return value % max;
}

function pick(chars: string): string {
  return chars[randomInt(chars.length)];
}

/** 英字（大小）と数字を必ず 1 文字ずつ含む、10 文字のパスワードを作る */
export function generatePassword(length = 10): string {
  const pool = LOWER + UPPER + DIGIT;
  const chars = [pick(UPPER), pick(LOWER), pick(DIGIT)];
  while (chars.length < length) chars.push(pick(pool));

  // 先頭 3 文字が「大文字・小文字・数字」の並びに固定されないよう混ぜる
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/** 8 文字以上で、英字と数字の両方を含むか */
export function isValidPassword(plain: string): boolean {
  return plain.length >= PASSWORD_MIN_LENGTH && /[A-Za-z]/.test(plain) && /[0-9]/.test(plain);
}
