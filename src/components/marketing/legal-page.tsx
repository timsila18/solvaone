import { PublicShell } from "@/components/marketing/public-shell";

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <PublicShell>
      <article className="mx-auto max-w-3xl px-4 py-14 md:px-6">
        <p className="text-xs font-black uppercase text-brand-blue">Starter policy - legal review required</p>
        <h1 className="mt-4 text-5xl font-black leading-[1.04]">{title}</h1>
        <div className="mt-8 space-y-6 text-sm leading-7 text-black/65 dark:text-white/65">{children}</div>
      </article>
    </PublicShell>
  );
}
