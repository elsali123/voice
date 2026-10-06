import { redirect } from "next/navigation";
import Studio from "@/components/Studio";
import { currentUser } from "@/lib/session";
import { firstName } from "@/lib/voices";

export default async function RecordPage() {
  const user = await currentUser();
  if (!user) redirect("/");
  return <Studio firstName={firstName(user.name)} settings={user.settings} />;
}
