import { ArrowRight, FileText } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { products, type ProductKey } from "@/lib/types";
import { formatKes } from "@/lib/utils";

export function ProductGrid() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {(Object.entries(products) as [ProductKey, (typeof products)[ProductKey]][]).map(([key, product]) => (
        <div key={key} className="rounded-lg border border-black/10 p-5 dark:border-white/10">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-blue text-white">
            <FileText className="h-5 w-5" />
          </div>
          <h3 className="mt-5 text-lg font-black">{product.title}</h3>
          <p className="mt-2 min-h-12 text-sm leading-6 text-black/55 dark:text-white/55">{product.description}</p>
          <div className="mt-5 flex items-center justify-between">
            <span className="text-sm font-black">{formatKes(product.priceKes)}</span>
            <ButtonLink href={`/dashboard/projects/new?product=${key}`} className="h-9 px-3">
              Create <ArrowRight className="h-4 w-4" />
            </ButtonLink>
          </div>
        </div>
      ))}
    </div>
  );
}
