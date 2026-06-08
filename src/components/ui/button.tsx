import Link from "next/link";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
};

const variants = {
  primary: "bg-brand-blue text-white hover:bg-blue-700",
  secondary: "border border-black/10 bg-white text-black hover:border-brand-blue/40 dark:border-white/15 dark:bg-white/10 dark:text-white",
  ghost: "text-black hover:bg-black/5 dark:text-white dark:hover:bg-white/10",
  danger: "bg-black text-white hover:bg-brand-blue dark:bg-white dark:text-black dark:hover:bg-brand-blue dark:hover:text-white"
};

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

type ButtonLinkProps = React.ComponentProps<typeof Link> & {
  variant?: ButtonProps["variant"];
  className?: string;
};

export function ButtonLink({ className, variant = "primary", ...props }: ButtonLinkProps) {
  return (
    <Link
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
