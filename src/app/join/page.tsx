import { redirect } from "next/navigation";
import JoinWizard from "@/components/JoinWizard";
import { currentUser } from "@/lib/session";

export default async function JoinPage() {
  if (await currentUser()) redirect("/");
  return <JoinWizard />;
}
