import { redirect } from "next/navigation";
import { getCurrentUser, nextCookieJar } from "@/lib/session";
import { TopNav } from "../TopNav";
import { MyReservationsView } from "./MyReservationsView";

export default async function MyReservationsPage() {
  const user = await getCurrentUser(await nextCookieJar());
  if (!user) redirect("/login?next=%2Fmy-reservations");

  return (
    <>
      <TopNav user={user} active="my-reservations" />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <MyReservationsView />
      </main>
    </>
  );
}
