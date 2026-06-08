import { BarChart3, BriefcaseBusiness, CheckCircle2, CreditCard, Files, FileText, Home, PenLine, Sparkles, UserRound } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/dashboard/projects/new?product=cv_builder", label: "CV Builder", icon: FileText },
  { href: "/dashboard/projects/new?product=cv_revamp", label: "CV Revamp", icon: Sparkles },
  { href: "/dashboard/projects/new?product=cover_letter", label: "Cover Letter", icon: PenLine },
  { href: "/dashboard/projects/new?product=company_profile", label: "Company Profile", icon: BriefcaseBusiness },
  { href: "/dashboard/projects/new?product=business_plan", label: "Business Plan", icon: BarChart3 },
  { href: "/dashboard/documents", label: "My Documents", icon: Files },
  { href: "/dashboard#payments", label: "Payments", icon: CreditCard },
  { href: "/dashboard/support", label: "Support", icon: PenLine }
];

export function AppShell({
  children,
  email,
  isAdmin = false
}: {
  children: React.ReactNode;
  email?: string;
  isAdmin?: boolean;
}) {
  return (
    <div className="min-h-screen bg-white text-black dark:bg-black dark:text-white">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 border-r border-black/10 bg-white/95 px-5 py-6 backdrop-blur dark:border-white/10 dark:bg-black/90 lg:block">
        <Logo />
        <nav className="mt-8 flex flex-col gap-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-semibold text-black/65 transition hover:bg-black/5 hover:text-black dark:text-white/65 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
          {isAdmin ? (
            <>
              <Link
                href="/dashboard/admin"
                className="mt-4 flex h-10 items-center gap-3 rounded-lg bg-brand-blue px-3 text-sm font-semibold text-white"
              >
                <BarChart3 className="h-4 w-4" />
                Admin
              </Link>
              <Link
                href="/dashboard/admin/launch"
                className="flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-semibold text-black/65 transition hover:bg-black/5 hover:text-black dark:text-white/65 dark:hover:bg-white/10 dark:hover:text-white"
              >
                <CheckCircle2 className="h-4 w-4" />
                Launch
              </Link>
            </>
          ) : null}
        </nav>
      </aside>
      <div className="lg:pl-72">
        <header className="sticky top-0 z-10 border-b border-black/10 bg-white/85 px-4 py-3 backdrop-blur dark:border-white/10 dark:bg-black/80 md:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="lg:hidden">
              <Logo />
            </div>
            <div className="hidden text-sm font-semibold text-black/55 dark:text-white/55 lg:block">
              Solva Business Group
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <div className={cn("hidden items-center gap-2 rounded-lg border border-black/10 px-3 py-2 dark:border-white/10 md:flex")}>
                <UserRound className="h-4 w-4 text-brand-blue" />
                <span className="max-w-44 truncate text-sm font-semibold">{email}</span>
              </div>
              <form action="/auth/signout" method="post">
                <button className="h-10 rounded-lg px-3 text-sm font-semibold text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10">
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </header>
        <main className="px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
