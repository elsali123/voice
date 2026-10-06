import type { PublicUser } from "@/lib/types";

const COLORS = ["#1d4e89", "#1e6b3a", "#8a3b12", "#5b3a8a", "#8f1c4f", "#2f5d62"];

/** Profile photo, or the person's initials on a colored circle. */
export default function Avatar({ user, size = 56 }: { user: PublicUser; size?: number }) {
  const style = { width: size, height: size };
  if (user.photoVersion > 0) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- local, already-small JPEG
      <img
        src={`/api/media/photo/${user.id}?v=${user.photoVersion}`}
        alt=""
        style={style}
        className="shrink-0 rounded-full border-2 border-line object-cover"
      />
    );
  }
  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  const color = COLORS[[...user.name].reduce((n, c) => n + c.charCodeAt(0), 0) % COLORS.length];
  return (
    <span
      aria-hidden="true"
      style={{ ...style, background: color, fontSize: size * 0.4 }}
      className="grid shrink-0 place-items-center rounded-full font-bold text-white"
    >
      {initials}
    </span>
  );
}
