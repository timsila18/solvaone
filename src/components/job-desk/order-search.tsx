import Link from "next/link";
import { Search } from "lucide-react";

export function OrderSearch({ query = "", origin = "all", showOrigin = false }: { query?: string; origin?: string; showOrigin?: boolean }) {
  return <form key={`${query}:${origin}`} action="/dashboard/admin/job-desk" method="get" role="search" aria-label="Search orders" className="my-5 flex flex-wrap items-end gap-2 border-y border-black/10 py-4 text-sm dark:border-white/10">
    <label className="min-w-48 flex-1 font-semibold">Search orders by name
      <input type="search" name="q" defaultValue={query} placeholder="Client name, phone or order ID" className="mt-1 h-10 w-full border border-black/15 bg-white px-3 font-normal text-black dark:border-white/20 dark:bg-black dark:text-white" />
    </label>
    {showOrigin ? <label className="font-semibold">Created through
      <select name="origin" defaultValue={origin} className="mt-1 block h-10 border border-black/15 bg-white px-3 font-normal text-black dark:border-white/20 dark:bg-black dark:text-white"><option value="all">All orders</option><option value="admin">Admin form</option><option value="website">Client website</option></select>
    </label> : null}
    <button type="submit" className="inline-flex h-10 w-10 items-center justify-center bg-brand-blue text-white" aria-label="Find orders" title="Find orders"><Search size={18} /></button>
    {(query || origin !== "all") && <Link href="/dashboard/admin/job-desk" className="inline-flex h-10 items-center px-2 font-semibold text-brand-blue">Clear</Link>}
  </form>;
}
