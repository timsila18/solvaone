import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-lg border border-black/10 bg-white px-3 text-sm text-black outline-none transition placeholder:text-black/40 focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20 dark:border-white/15 dark:bg-white/10 dark:text-white dark:placeholder:text-white/45",
        className
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-28 w-full rounded-lg border border-black/10 bg-white px-3 py-3 text-sm text-black outline-none transition placeholder:text-black/40 focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20 dark:border-white/15 dark:bg-white/10 dark:text-white dark:placeholder:text-white/45",
        className
      )}
      {...props}
    />
  );
}
