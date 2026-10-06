"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconHome, IconUser, IconVideo } from "./icons";

const ITEMS = [
  { href: "/", label: "Home", Icon: IconHome },
  { href: "/record", label: "Record", Icon: IconVideo },
  { href: "/me", label: "My profile", Icon: IconUser },
];

export default function BottomNav() {
  const pathname = usePathname();
  // Hidden while recording so nobody leaves an interview by accident.
  if (pathname.startsWith("/record") || pathname.startsWith("/join")) return null;
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-line bg-card/95 backdrop-blur">
      <ul className="mx-auto grid max-w-3xl grid-cols-3">
        {ITEMS.map(({ href, label, Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-1 py-3 text-lg font-bold ${
                  active ? "text-brand" : "text-ink-soft hover:text-ink"
                }`}
              >
                <span className={`rounded-full px-5 py-1 ${active ? "bg-brand-soft" : ""}`}>
                  <Icon className="size-8" />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
