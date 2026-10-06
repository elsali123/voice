import Link from "next/link";
import { redirect } from "next/navigation";
import MeForm from "@/components/MeForm";
import { brainInfo } from "@/lib/ai";
import { currentUser } from "@/lib/session";

export default async function MePage() {
  const user = await currentUser();
  if (!user) redirect("/");
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-4xl font-bold">My profile</h1>
        <Link href={`/people/${user.id}`} className="rounded-2xl border-2 border-line bg-card px-5 py-3 text-xl font-bold hover:border-brand">
          See my page as others see it
        </Link>
      </div>
      <MeForm user={user} brainLabel={brainInfo().label} />
    </div>
  );
}
