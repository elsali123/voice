"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** While a story's summary is being written, checks every few seconds and refreshes when it's ready. */
export default function StatusPoller({ storyId }: { storyId: string }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(async () => {
      const res = await fetch(`/api/stories/${storyId}`).catch(() => null);
      const data = res?.ok ? ((await res.json()) as { status: string }) : null;
      if (data?.status === "ready") {
        clearInterval(timer);
        router.refresh();
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [storyId, router]);
  return null;
}
