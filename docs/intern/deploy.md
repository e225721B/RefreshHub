# デプロイ手順（Vercel + Supabase）

アプリは **Vercel**、データベースは **Supabase（PostgreSQL）** に置き、ネットワーク越しに接続する構成にする。

## 全体像

~~~mermaid
flowchart LR
  U["利用者・管理者<br/>ブラウザ"] -->|"HTTPS"| V["Vercel<br/>Next.js（App Router）<br/>サーバ側の処理もここで動く"]
  V -->|"PostgreSQL<br/>Connection pooler :6543"| S["Supabase<br/>PostgreSQL"]
  D["開発者の手元<br/>prisma migrate"] -->|"直結 :5432"| S

  style U fill:#ffffff,color:#000000
  style V fill:#ffffff,color:#000000
  style S fill:#ffffff,color:#000000
  style D fill:#ffffff,color:#000000
~~~

**接続先が 2 つあるのが要点。** 普段の読み書きは pooler（6543）、マイグレーションは直結（5432）を使う。
Vercel は「リクエストのたびに関数が立ち上がる」仕組みなので、DB へ直結すると接続数がすぐ上限に達する。
一方で `prisma migrate` はテーブルの作り替えをするため pooler を通せない。だから使い分ける。

---

## 1. Supabase 側の準備

1. [supabase.com](https://supabase.com) でプロジェクトを作る。**リージョンは Tokyo（ap-northeast-1）** を選ぶ（Vercel との距離が近いほど速い）
2. DB のパスワードは作成時にしか表示されない。**その場で控える**
3. 接続文字列を 2 つコピーする

| 用途 | Supabase 画面上の名前 | ポート |
|---|---|---|
| アプリが使う | **Connection pooling**（Transaction mode） | 6543 |
| マイグレーション用 | **Direct connection** | 5432 |

画面上部の **Connect** ボタンからも取得できる。**ORM タブ → Prisma** を選ぶと、
`DATABASE_URL` と `DIRECT_URL` の 2 行がそのままの形で表示されるので、これをコピーするのが早い。

pooler 側の URL には、末尾に **`?pgbouncer=true&connection_limit=1`** を付ける。
付けないと Prisma が prepared statement を作り置きし、`prepared statement "s0" already exists` で失敗する。

**パスワードに記号が入っているときは URL エンコードする。** URL の一部として渡すため、
`@` `#` `?` `/` `:` などはそのまま書くと接続文字列が途中で切れて解釈される
（`@` → `%40`、`#` → `%23`、`?` → `%3F`、`/` → `%2F`、`:` → `%3A`）。
記号を含まないパスワードに変えてしまうのが確実。

---

## 2. 手元から DB を用意する

`massage-booking/.env` を作る（`.env.example` をコピーして値を埋める）。

```bash
DATABASE_URL="postgresql://postgres.xxxx:パスワード@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres.xxxx:パスワード@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres"
TZ="Asia/Tokyo"
SESSION_SECRET="（node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" で生成）"
```

テーブルを作り、動作確認用のデータを入れる。

```bash
cd massage-booking
npm run db:migrate   # prisma migrate deploy（DIRECT_URL 側を使う）
npm run db:seed      # 管理者・マッサージ師・ベッドを投入
```

> **`db:seed` は全テーブルを削除してから入れ直す。** 本番として使い始めたあとに実行しないこと。

うまくいったかは、Supabase の **Table Editor** に `User` / `Reservation` / `Bed` など 10 個のテーブルが
できていることで確認できる。`User` には管理者・マッサージ師 4 名・利用者 3 名の 8 行が入る。

### つながらないときに見るところ

| 症状 | 原因 |
|---|---|
| `Can't reach database server` | URL のホスト名・ポートが違う。マイグレーションは **5432（直結）** 側 |
| `password authentication failed` | パスワードが違う。記号を URL エンコードしていない可能性もある |
| `prepared statement "s0" already exists` | pooler の URL に `?pgbouncer=true` が付いていない |
| `relation "User" does not exist` | マイグレーションがまだ流れていない（`npm run db:migrate`） |

---

## 3. Vercel 側の設定

1. GitHub リポジトリを Vercel にインポートする
2. **Root Directory に `massage-booking` を指定する**（リポジトリ直下ではない。ここを間違えると「Next.js が見つからない」で失敗する）
3. Environment Variables に次を登録する（Production / Preview の両方）

| 変数 | 値 | 必須 |
|---|---|---|
| `DATABASE_URL` | pooler の URL（6543 / `?pgbouncer=true&connection_limit=1` 付き） | ○ |
| `DIRECT_URL` | 直結の URL（5432） | ○ |
| `TZ` | `Asia/Tokyo` | ○ |
| `SESSION_SECRET` | 32 バイトのランダムな文字列 | ○ |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | `npx web-push generate-vapid-keys` の出力 | 任意（通知を使うなら） |

4. デプロイする。ビルドは `prisma generate && next build`（`package.json` に設定済み）

**`TZ=Asia/Tokyo` は必ず入れる。** Vercel の実行環境は既定が UTC で、このアプリは予約日時を
ローカル時刻で組み立てているため、設定しないと**予約が 9 時間ずれる**。
（`lib/timezone.ts` が保険として上書きするが、環境変数で入れるのが正しい）

---

## 4. デプロイ後の確認

1. `/login` を開き、`admin@example.com` / `password1234` でログインできる（= DB に届いている）
2. `/admin` の予約状況が表示され、**時刻が日本時間で出ている**（9:00 の枠が 9:00 に見える）
3. `/` から予約を 1 件入れ、`/admin` に反映される
4. Supabase の Table Editor で `Reservation` に行が増えていることを確認する

---

## 補足

### スキーマを変えたとき

```bash
npx prisma migrate dev --name 変更内容    # 手元で新しいマイグレーションを作る
npm run db:migrate                        # Supabase に適用する
git add prisma/migrations && git commit    # マイグレーションは必ずコミットする
```

Vercel のビルドではマイグレーションを流していない。**適用は手元から行う**
（ビルド中に DB を変更すると、失敗したときに途中状態で残るため）。

### ローカル開発での DB

SQLite をやめたので、手元でも PostgreSQL が要る。どちらかを選ぶ。

- **Supabase の開発用プロジェクトにつなぐ**（追加のインストール不要。おすすめ）
- **Docker で立てる**
  ```bash
  docker run -d --name refreshhub-pg -e POSTGRES_PASSWORD=devpass \
    -e POSTGRES_DB=refreshhub -p 55432:5432 postgres:16-alpine
  # .env の DATABASE_URL / DIRECT_URL をどちらも
  # postgresql://postgres:devpass@localhost:55432/refreshhub にする  # pragma: allowlist secret
  ```

自動テスト（`npm test`）も DB を使うものがあるため、`DATABASE_URL` が必要。

### 残っている課題: RLS（行レベルセキュリティ）

Prisma が作ったテーブルは **RLS が無効**で、Supabase では「Unrestricted」と警告が出る。
Supabase は Data API（PostgREST）でもテーブルを公開するため、**RLS が無効だと `anon` キーを持つ誰でも
`User` テーブル（メールアドレス・パスワードハッシュを含む）を直接読める**。

このアプリは Data API を使わず Prisma で直接つないでいるが、使っていない裏口が開いた状態になる。
**全テーブルで RLS を有効にすれば塞がる**（ポリシーを書かなければ既定で全拒否）。
アプリが接続するロールはテーブルの所有者なので RLS を素通りし、**有効にしても動作は変わらない**
（手元の PostgreSQL で全テーブルに適用し、テスト 111 件と画面操作が通ることを確認済み）。

```sql
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;   -- 以下、全テーブル分
```

### 秘密情報の扱い

- DB のパスワード・`SESSION_SECRET`・VAPID の秘密鍵は**コミットしない**（`.env` は `.gitignore` 済み）
- Supabase の画面から取得した接続文字列には**パスワードが含まれる**。Slack などに貼らない

### 移行で変わったこと

| | 変更前 | 変更後 |
|---|---|---|
| DB | SQLite（`prisma/dev.db` というファイル） | PostgreSQL（Supabase） |
| 接続設定 | `DATABASE_URL` だけ | `DATABASE_URL` + `DIRECT_URL` |
| マイグレーション | SQLite 用 11 個 | PostgreSQL 用に作り直し（1 個） |
| 文字列検索 | SQLite は大文字小文字を区別しない | **Postgres は区別する**ため `mode: "insensitive"` を明示 |
| タイムゾーン | 手元の Mac が JST なので意識不要 | **Vercel は UTC**。`TZ=Asia/Tokyo` が必須 |
