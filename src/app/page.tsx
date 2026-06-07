import { ArrowRight, CheckCircle2 } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { products } from "@/lib/types";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white text-black dark:bg-black dark:text-white">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5">
        <Logo />
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <ButtonLink href="/login" variant="secondary">
            Login
          </ButtonLink>
          <ButtonLink href="/register">Get started</ButtonLink>
        </div>
      </header>
      <section className="mx-auto grid max-w-7xl gap-10 px-5 py-12 lg:grid-cols-[1fr_0.9fr] lg:items-center lg:py-20">
        <div>
          <h1 className="max-w-4xl text-5xl font-black leading-[1.03] tracking-normal md:text-7xl">
            SolvaOne
          </h1>
          <p className="mt-5 max-w-2xl text-xl font-semibold text-black/65 dark:text-white/65">
            Create. Apply. Grow.
          </p>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-black/60 dark:text-white/60">
            Premium AI document generation for careers, companies, and growing businesses across Kenya.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/register">
              Start a project <ArrowRight className="h-4 w-4" />
            </ButtonLink>
            <ButtonLink href="/login" variant="secondary">
              Open dashboard
            </ButtonLink>
          </div>
        </div>
        <div className="rounded-lg border border-black/10 bg-white p-4 shadow-soft dark:border-white/10 dark:bg-white/5">
          <div className="rounded-lg border border-black/10 bg-black p-5 text-white dark:border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">Document Studio</span>
              <span className="text-xs text-white/55">Autosave ready</span>
            </div>
            <div className="mt-6 space-y-3">
              {Object.values(products).map((product) => (
                <div key={product.title} className="flex items-start gap-3 rounded-lg bg-white/8 p-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-brand-blue" />
                  <div>
                    <div className="text-sm font-bold">{product.title}</div>
                    <div className="text-xs leading-5 text-white/55">{product.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
