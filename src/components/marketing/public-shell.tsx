import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ButtonLink } from "@/components/ui/button";
import { productPages, site } from "@/lib/marketing";

const nav = [
  { href: "/", label: "Home" },
  { href: "/pricing", label: "Pricing" },
  { href: "/resources", label: "Resources" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" }
];

export function PublicNavbar() {
  return (
    <header className="sticky top-0 z-30 border-b border-black/10 bg-white/92 backdrop-blur dark:border-white/10 dark:bg-black/88">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-6">
        <Logo />
        <nav className="hidden items-center gap-6 text-sm font-bold text-black/65 dark:text-white/65 lg:flex">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="transition hover:text-brand-blue">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <ButtonLink className="hidden md:inline-flex" href="/login" variant="secondary">
            Login
          </ButtonLink>
          <ButtonLink href="/dashboard/projects/new?product=cv_builder">Create My Document</ButtonLink>
        </div>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-black/10 bg-black text-white dark:border-white/10">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-[1.1fr_0.9fr_0.9fr] md:px-6">
        <div>
          <Logo />
          <p className="mt-4 max-w-sm text-sm leading-6 text-white/65">
            Premium AI document generation by {site.parent}. Built for job seekers, SMEs and professionals in Kenya.
          </p>
        </div>
        <div>
          <h2 className="text-sm font-black">Products</h2>
          <div className="mt-4 grid gap-2 text-sm text-white/65">
            {productPages.map((page) => (
              <Link key={page.key} href={`/products/${page.slug}`} className="hover:text-white">
                {page.headline.split(".")[0]}
              </Link>
            ))}
          </div>
        </div>
        <div>
          <h2 className="text-sm font-black">Company</h2>
          <div className="mt-4 grid gap-2 text-sm text-white/65">
            <Link href="/about" className="hover:text-white">About</Link>
            <Link href="/terms" className="hover:text-white">Terms and Conditions</Link>
            <Link href="/privacy" className="hover:text-white">Privacy Policy</Link>
            <Link href="/refund-policy" className="hover:text-white">Refund Policy</Link>
          </div>
        </div>
      </div>
      <div className="border-t border-white/10 px-4 py-4 text-center text-xs font-semibold text-white/45">
        Copyright {new Date().getFullYear()} {site.name}. {site.tagline}
      </div>
    </footer>
  );
}

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-white text-black dark:bg-black dark:text-white">
      <PublicNavbar />
      {children}
      <MobileStickyCta />
      <PublicFooter />
    </main>
  );
}

function MobileStickyCta() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-black/10 bg-white/95 p-3 backdrop-blur dark:border-white/10 dark:bg-black/90 md:hidden">
      <ButtonLink className="w-full" href="/dashboard/projects/new?product=cv_builder">
        Create My Document
      </ButtonLink>
    </div>
  );
}
