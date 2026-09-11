# マッサージ室の予約（RefreshHub）

社内マッサージ室の空き状況の確認と予約を行う Next.js アプリ。

- 要件・設計・実装の記録: `../docs/intern/`
- **デプロイ手順（Vercel + Supabase）: `../docs/intern/deploy.md`**

## 動かす

データベースは **PostgreSQL**（本番は Supabase）。手元では Supabase の開発用プロジェクトにつなぐか、
Docker で PostgreSQL を立てる。

```bash
# 1. Docker で PostgreSQL を立てる場合
docker run -d --name refreshhub-pg -e POSTGRES_PASSWORD=devpass \
  -e POSTGRES_DB=refreshhub -p 55432:5432 postgres:16-alpine

# 2. .env を用意する（.env.example をコピーして値を埋める）
cp .env.example .env

# 3. テーブルを作り、動作確認用のデータを入れる
npm install
npm run db:migrate
npm run db:seed

# 4. 起動する
npm run dev
```

ログインは `admin@example.com` / `password1234`（シードで作られる仮アカウント）。

## よく使うコマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバ |
| `npm run build` | 本番ビルド（`prisma generate` を含む） |
| `npm test` | 自動テスト（DB を使うものがあるため `.env` が必要） |
| `npm run db:migrate` | マイグレーションを適用（`prisma migrate deploy`） |
| `npm run db:seed` | シード投入（**全テーブルを消してから入れ直す**） |
| `npm run lint` | ESLint |

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
