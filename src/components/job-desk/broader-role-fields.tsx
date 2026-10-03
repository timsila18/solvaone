"use client";

import { useState } from "react";
import { generalJobFamilies } from "@/lib/job-desk/general-jobs";
import type { ApplicationScope } from "@/lib/job-desk/application-scope";

export function BroaderRoleFields({ initial }: { initial?: ApplicationScope | null }) {
  const [enabled, setEnabled] = useState(initial?.includeBroaderRoles ?? false);
  const [general, setGeneral] = useState(initial?.includeGeneralRoles ?? false);
  const [families, setFamilies] = useState<string[]>(initial?.generalRoleFamilies ?? []);
  const field = "w-full rounded border border-black/20 bg-white p-3 text-sm text-black dark:border-white/20";
  return <fieldset className="mt-5 space-y-4 border-t border-black/10 pt-4 dark:border-white/10">
    <legend className="text-sm font-bold">Broader opportunities</legend>
    <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="includeBroaderRoles" value="true" checked={enabled} onChange={event => setEnabled(event.target.checked)} className="mt-1 h-4 w-4 accent-brand-blue" /><span>Include broader roles that match my transferable skills</span></label>
    {enabled ? <div className="grid gap-4 sm:grid-cols-2">
      <label className="grid gap-2 text-sm font-bold sm:col-span-2">Accepted broader job titles<input name="broaderRoles" defaultValue={initial?.broaderRoles?.join(", ")} required maxLength={1000} placeholder="Customer support, sales support, operations coordinator" className={field} /></label>
      <label className="grid gap-2 text-sm font-bold">Lowest acceptable career level<select name="broaderSeniority" defaultValue={initial?.broaderSeniority ?? "professional"} className={field}><option value="any">Include entry-level roles</option><option value="professional">Professional roles; no internships or traineeships</option><option value="senior">Senior or supervisory roles only</option></select></label>
    </div> : null}
    <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="includeGeneralRoles" value="true" checked={general} onChange={event => setGeneral(event.target.checked)} className="mt-1 h-4 w-4 accent-brand-blue" /><span>I also accept entry-level and general jobs in the selected fields</span></label>
    {general ? <div className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="generalRoleFamilies" value={families.join(",")} />
      {generalJobFamilies.map(family => <label key={family.id} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={families.includes(family.id)} onChange={event => setFamilies(current => event.target.checked ? [...current, family.id] : current.filter(id => id !== family.id))} className="mt-1 h-4 w-4 accent-brand-blue" />{family.label}</label>)}
      <p className="text-xs leading-5 sm:col-span-2">Suitable openings may accept Form Four education or provide training. Your locations and exclusions still apply. Select at least one field; mandatory requirements must still be met.</p>
    </div> : null}
    {enabled || general ? <label className="grid gap-2 text-sm font-bold">Minimum monthly pay (KSh)<input name="minimumMonthlyKes" defaultValue={initial?.minimumMonthlyKes || ""} type="number" min="0" max="9999999" step="1" placeholder="Optional" className={field} /></label> : null}
  </fieldset>;
}
