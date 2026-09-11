// タイムゾーンの保険が効いているかのテスト。
//
// TZ はプロセス全体の設定なので、テストの中で切り替えると他のテストに影響する。
// そのため **TZ=UTC を与えた子プロセス**を起動し、その中での見え方を確かめる。
//
// これが壊れると「予約が 9 時間ずれる」という、画面を見ただけでは気づきにくい形で表れる。

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

/** TZ を指定した子プロセスで式を評価し、標準出力を返す */
function runWithTZ(tz: string, code: string): string {
  return execFileSync(process.execPath, ["--experimental-strip-types", "-e", code], {
    cwd: path.join(here, ".."),
    env: { ...process.env, TZ: tz },
    encoding: "utf8",
  }).trim();
}

test("TZ=UTC の環境でも、lib/timezone を読み込めば JST になる", () => {
  const out = runWithTZ(
    "UTC",
    `import("./lib/timezone.ts").then(() => {
       console.log(JSON.stringify({ tz: process.env.TZ, offset: new Date().getTimezoneOffset() }));
     });`,
  );
  const { tz, offset } = JSON.parse(out);
  assert.equal(tz, "Asia/Tokyo", "TZ が Asia/Tokyo に上書きされること");
  assert.equal(offset, -540, "UTC との差が 9 時間（-540 分）になること");
});

test("読み込まないと UTC のままになる（保険が必要な理由）", () => {
  const out = runWithTZ("UTC", `console.log(new Date().getTimezoneOffset());`);
  assert.equal(Number(out), 0, "何もしなければ UTC（ずれ 0 分）のまま");
});

test("9:00 の予約は、TZ=UTC の環境でも 9:00 として組み立てられる", () => {
  // lib/timezone を読み込んだうえで「2026-09-14 09:00」を作ると、UTC では前日 24:00 = 00:00Z になる。
  // 読み込まないと 09:00Z になり、日本時間で見たとき 18:00 にずれる。
  const out = runWithTZ(
    "UTC",
    `import("./lib/timezone.ts").then(() => {
       const d = new Date(2026, 8, 14, 9, 0);
       console.log(d.toISOString());
     });`,
  );
  assert.equal(out, "2026-09-14T00:00:00.000Z");
});
