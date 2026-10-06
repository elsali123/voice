import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl space-y-6 rounded-3xl border-2 border-line bg-card p-10 text-center">
      <h1 className="text-4xl font-bold">We couldn&rsquo;t find that page</h1>
      <p className="text-2xl">It may have been deleted, or it may be private.</p>
      <Link href="/" className="inline-block rounded-2xl bg-brand px-8 py-4 text-2xl font-bold text-white">
        Go home
      </Link>
    </div>
  );
}
