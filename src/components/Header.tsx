import Link from "next/link";
import Avatar from "./Avatar";
import TextSizeSwitch from "./TextSizeSwitch";
import { IconBook } from "./icons";
import type { PublicUser } from "@/lib/types";

export default function Header({ user }: { user: PublicUser | null }) {
  return (
    <header className="border-b-2 border-line bg-card">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-2xl font-bold text-brand">
          <IconBook className="size-9" />
          Life Stories
        </Link>
        <div className="flex items-center gap-4">
          <TextSizeSwitch />
          {user && (
            <Link href="/me" className="flex items-center gap-2 rounded-full pr-2 font-bold hover:bg-brand-soft" aria-label="My profile">
              <Avatar user={user} size={44} />
              <span className="hidden sm:inline">{user.name.split(/\s+/)[0]}</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
