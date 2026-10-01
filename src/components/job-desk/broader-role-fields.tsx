"use client";

import { useState } from "react";

export function BroaderRoleFields() {
  const [enabled, setEnabled] = useState(false);
  const field = "w-full rounded border border-black/20 bg-white p-3 text-sm text-black dark:border-white/20";
  return <fieldset className="mt-5 space-y-4 border-t border-black/10 pt-4 dark:border-white/10">
    <legend className="text-sm font-bold">Broader opportunities</legend>
    <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="includeBroaderRoles" value="true" checked={enabled} onChange={event => setEnabled(event.target.checked)} className="mt-1 h-4 w-4 accent-brand-blue" /><span>Include broader roles that match my transferable skills</span></label>
    {enabled ? <div className="grid gap-4 sm:grid-cols-2">
      <label className="grid gap-2 text-sm font-bold sm:col-span-2">Accepted broader job titles<input name="broaderRoles" required maxLength={1000} placeholder="Customer support, sales support, operations coordinator" className={field} /></label>
      <label className="grid gap-2 text-sm font-bold">Lowest acceptable career level<select name="broaderSeniority" defaultValue="professional" className={field}><option value="any">Include entry-level roles</option><option value="professional">Professional roles; no internships or traineeships</option><option value="senior">Senior or supervisory roles only</option></select></label>
      <label className="grid gap-2 text-sm font-bold">Minimum monthly pay (KSh)<input name="minimumMonthlyKes" type="number" min="0" max="9999999" step="1" placeholder="Optional" className={field} /></label>
    </div> : null}
  </fieldset>;
}
