"use client";

import { CreditCard, Download, Loader2, Save, Sparkles, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { trackEvent } from "@/lib/analytics";
import { products, type ProductKey } from "@/lib/types";
import { templatesForProduct } from "@/lib/template-registry";
import { formatKes } from "@/lib/utils";
import type { GenerationMode } from "@/lib/solva-intelligence/types";
import { pricingProducts } from "@/lib/pricing";

type EditorStudioProps = {
  userId: string;
  productKey: ProductKey;
};

export function EditorStudio({ userId, productKey }: EditorStudioProps) {
  const router = useRouter();
  const product = products[productKey];
  const pricing = pricingProducts[productKey];
  const [projectId, setProjectId] = useState<string | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [title, setTitle] = useState(product.title);
  const [brief, setBrief] = useState("");
  const [payload, setPayload] = useState<Record<string, string>>({});
  const [html, setHtml] = useState("");
  const [qualityNotes, setQualityNotes] = useState<string[]>([]);
  const [qualityScores, setQualityScores] = useState<Record<string, number>>({});
  const [status, setStatus] = useState("Draft");
  const templates = templatesForProduct(productKey);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [isPending, startTransition] = useTransition();

  const fields = getFields(productKey);
  const canGenerate = useMemo(
    () => Object.values(payload).join(" ").trim().length > 40 || brief.trim().length > 40,
    [brief, payload]
  );

  function updatePayload(key: string, value: string) {
    setPayload((current) => ({ ...current, [key]: value }));
  }

  function saveDraft(nextHtml = html) {
    startTransition(async () => {
      setStatus("Saving");
      const response = await fetch("/api/documents/autosave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, documentId, product: productKey, templateId, title, brief, payload, html: nextHtml })
      });
      const responsePayload = await response.json();
      if (!response.ok) {
        setStatus(responsePayload.error ?? "Save failed");
        return;
      }
      setProjectId(responsePayload.projectId);
      setDocumentId(responsePayload.documentId);
      setStatus("Saved");
    });
  }

  function generateDocument(mode: GenerationMode = "full_document") {
    startTransition(async () => {
      trackEvent("start_document", { product: productKey, mode });
      setStatus(mode === "full_document" ? "Generating with Solva Intelligence" : "Improving with Solva Intelligence");
      const saveResponse = await fetch("/api/documents/autosave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, documentId, product: productKey, templateId, title, brief, payload, html })
      });
      const saved = await saveResponse.json();
      if (!saveResponse.ok) {
        setStatus(saved.error ?? "Save failed");
        return;
      }
      setProjectId(saved.projectId);
      setDocumentId(saved.documentId);

      const response = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: saved.projectId,
          documentId: saved.documentId,
          product: productKey,
          templateId,
          title,
          brief,
          payload,
          mode,
          sectionHtml: html
        })
      });
      const responsePayload = await response.json();
      if (!response.ok) {
        setStatus(responsePayload.error ?? "Generation failed");
        return;
      }
      setHtml(responsePayload.html);
      setQualityScores(responsePayload.output?.qualityScores ?? {});
      setQualityNotes(responsePayload.output?.qualityScores?.notes ?? responsePayload.output?.improvementNotes ?? []);
      setStatus("Ready");
      trackEvent("document_generated", { product: productKey, documentId: saved.documentId, mode });
    });
  }

  function goToCheckout() {
    startTransition(async () => {
      let activeProjectId = projectId;
      if (!activeProjectId) {
        setStatus("Saving");
        const saveResponse = await fetch("/api/documents/autosave", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, documentId, product: productKey, templateId, title, brief, payload, html })
        });
        const saved = await saveResponse.json();
        if (!saveResponse.ok) {
          setStatus(saved.error ?? "Save failed");
          return;
        }
        activeProjectId = saved.projectId;
        setProjectId(saved.projectId);
        setDocumentId(saved.documentId);
      }
      router.push(`/dashboard/checkout?projectId=${activeProjectId}&productId=${productKey}`);
    });
  }

  function saveVersion() {
    startTransition(async () => {
      if (!documentId) {
        saveDraft();
        return;
      }
      setStatus("Saving version");
      const response = await fetch("/api/documents/version", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, html, payload, changeType: "manual_edit" })
      });
      const saved = await response.json();
      setStatus(response.ok ? `Version ${saved.versionNumber} saved` : saved.error ?? "Version save failed");
    });
  }

  async function download(format: "pdf" | "docx") {
    if (!documentId) {
      saveDraft();
      return;
    }

    const response = await fetch(`/api/documents/export?documentId=${documentId}&format=${format}`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${title.replace(/\W+/g, "-").toLowerCase()}.${format}`;
    anchor.click();
    URL.revokeObjectURL(url);
    trackEvent(format === "pdf" ? "pdf_downloaded" : "docx_downloaded", { documentId, product: productKey });
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-lg border border-black/10 p-5 dark:border-white/10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black">{product.title}</h1>
            <p className="mt-2 text-sm leading-6 text-black/55 dark:text-white/55">{product.description}</p>
          </div>
          <span className="rounded-lg bg-brand-blue px-3 py-2 text-sm font-black text-white">{formatKes(pricing.price)}</span>
        </div>
        <div className="mt-6 space-y-4">
          <label className="block text-sm font-bold">
            Project title
            <Input className="mt-2" value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          {templates.length ? (
            <label className="block text-sm font-bold">
              Template
              <select
                className="mt-2 h-11 w-full rounded-lg border border-black/10 bg-white px-3 text-sm text-black outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20 dark:border-white/15 dark:bg-white/10 dark:text-white"
                value={templateId}
                onChange={(event) => setTemplateId(event.target.value)}
              >
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
              <span className="mt-2 block text-xs font-medium leading-5 text-black/50 dark:text-white/50">
                Generation will follow the selected structure and tone.
              </span>
            </label>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            {fields.map((field) => (
              <label key={field.key} className="block text-sm font-bold md:col-span-1">
                {field.label}
                {field.type === "textarea" ? (
                  <Textarea
                    className="mt-2 min-h-28"
                    value={payload[field.key] ?? ""}
                    onChange={(event) => updatePayload(field.key, event.target.value)}
                    placeholder={field.placeholder}
                  />
                ) : (
                  <Input
                    className="mt-2"
                    value={payload[field.key] ?? ""}
                    onChange={(event) => updatePayload(field.key, event.target.value)}
                    placeholder={field.placeholder}
                  />
                )}
              </label>
            ))}
          </div>
          <label className="block text-sm font-bold">
            Additional instructions
            <Textarea
              className="mt-2 min-h-28"
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              placeholder="Add any extra context, constraints, tender details, job advert text, or style instructions."
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <Button onClick={goToCheckout} disabled={isPending}>
              <CreditCard className="h-4 w-4" /> Pay & Generate
            </Button>
            <Button onClick={() => saveDraft()} disabled={isPending}>
              <Save className="h-4 w-4" /> Save
            </Button>
            <Button onClick={() => generateDocument()} disabled={isPending || !canGenerate}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Generate
            </Button>
            <Button variant="secondary" onClick={saveVersion} disabled={isPending || !html}>
              <Save className="h-4 w-4" /> Save version
            </Button>
          </div>
          <p className="text-sm font-semibold text-black/55 dark:text-white/55">Status: {status}</p>
          {Object.keys(qualityScores).length ? (
            <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
              <p className="text-sm font-black">Quality</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs font-bold">
                {Object.entries(qualityScores)
                  .filter(([, value]) => typeof value === "number")
                  .map(([key, value]) => (
                    <div key={key} className="rounded-lg bg-black/5 px-2 py-2 dark:bg-white/10">
                      {key}: {value}
                    </div>
                  ))}
              </div>
              {qualityNotes.length ? <p className="mt-3 text-xs leading-5 text-black/55 dark:text-white/55">{qualityNotes.join(" ")}</p> : null}
            </div>
          ) : null}
        </div>
      </section>
      <section className="rounded-lg border border-black/10 dark:border-white/10">
        <div className="flex items-center justify-between border-b border-black/10 p-3 dark:border-white/10">
          <div className="flex gap-1">
            {["B", "I", "H1"].map((label) => (
              <button key={label} className="h-8 rounded-lg px-3 text-sm font-black hover:bg-black/5 dark:hover:bg-white/10">
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" className="h-8 px-3" onClick={() => generateDocument("make_more_professional")}>
              <Wand2 className="h-4 w-4" /> Professional
            </Button>
            <Button variant="secondary" className="h-8 px-3" onClick={() => generateDocument("make_more_detailed")}>
              <Wand2 className="h-4 w-4" /> Detailed
            </Button>
            <Button variant="secondary" className="h-8 px-3" onClick={() => generateDocument("fix_grammar")}>
              <Wand2 className="h-4 w-4" /> Grammar
            </Button>
            <Button variant="secondary" className="h-8 px-3" onClick={() => download("pdf")}>
              <Download className="h-4 w-4" /> PDF
            </Button>
            <Button variant="secondary" className="h-8 px-3" onClick={() => download("docx")}>
              <Download className="h-4 w-4" /> DOCX
            </Button>
          </div>
        </div>
        <div
          className="prose prose-sm max-w-none p-6 outline-none dark:prose-invert"
          contentEditable
          suppressContentEditableWarning
          onBlur={(event) => {
            const next = event.currentTarget.innerHTML;
            setHtml(next);
            saveDraft(next);
          }}
          dangerouslySetInnerHTML={{ __html: html || "<h2>Start generating your document</h2><p>Your AI output will appear here after generation.</p>" }}
        />
      </section>
    </div>
  );
}

function getFields(product: ProductKey) {
  const common = [{ key: "preferredTone", label: "Preferred tone", placeholder: "Professional, executive, warm, public sector", type: "text" }];
  if (product === "cv_builder") {
    return [
      { key: "personalDetails", label: "Personal details", placeholder: "Name, phone, email, location, LinkedIn", type: "textarea" },
      { key: "targetJobTitle", label: "Target job title", placeholder: "Human Resource Officer", type: "text" },
      { key: "industry", label: "Industry", placeholder: "HR, ICT, finance, NGO, public sector", type: "text" },
      { key: "experienceLevel", label: "Experience level", placeholder: "Graduate, mid-level, executive", type: "text" },
      { key: "workExperience", label: "Work experience", placeholder: "Roles, employers, dates, responsibilities, achievements", type: "textarea" },
      { key: "education", label: "Education", placeholder: "Schools, degrees, dates", type: "textarea" },
      { key: "skills", label: "Skills", placeholder: "Technical and soft skills", type: "textarea" },
      { key: "certifications", label: "Certifications", placeholder: "Professional certifications or To be provided", type: "textarea" },
      { key: "projectsLeadership", label: "Projects and leadership", placeholder: "Projects, leadership roles, awards", type: "textarea" },
      { key: "referees", label: "Referees", placeholder: "Referees or To be provided", type: "textarea" },
      ...common
    ];
  }
  if (product === "cv_revamp") {
    return [
      { key: "oldCvContent", label: "Old CV content", placeholder: "Paste the current CV content", type: "textarea" },
      { key: "targetJobTitle", label: "Target job title", placeholder: "Procurement Officer", type: "text" },
      { key: "targetIndustry", label: "Target industry", placeholder: "Public sector, NGO, banking", type: "text" },
      { key: "yearsExperience", label: "Years of experience", placeholder: "5 years", type: "text" },
      { key: "cvStyle", label: "Preferred CV style", placeholder: "Graduate, professional, executive, technical, public service", type: "text" },
      { key: "improvementGoal", label: "Improvement goal", placeholder: "ATS Optimization, Executive Upgrade, Career Change", type: "text" },
      ...common
    ];
  }
  if (product === "cover_letter") {
    return [
      { key: "applicantName", label: "Applicant name", placeholder: "Jane Doe", type: "text" },
      { key: "targetJobTitle", label: "Target job title", placeholder: "Operations Manager", type: "text" },
      { key: "company", label: "Company/organization", placeholder: "Company name", type: "text" },
      { key: "industry", label: "Industry", placeholder: "NGO, ICT, finance", type: "text" },
      { key: "experienceSummary", label: "Experience summary", placeholder: "Summarize relevant background", type: "textarea" },
      { key: "keyAchievements", label: "Key achievements", placeholder: "Evidence, metrics, projects", type: "textarea" },
      { key: "jobAdvertText", label: "Job advert text", placeholder: "Paste job advert if available", type: "textarea" },
      { key: "letterType", label: "Cover letter type", placeholder: "Graduate, professional, management, public sector, NGO, internship", type: "text" },
      ...common
    ];
  }
  if (product === "company_profile") {
    return [
      { key: "companyName", label: "Company name", placeholder: "Solva Business Group", type: "text" },
      { key: "yearFounded", label: "Year founded", placeholder: "2024", type: "text" },
      { key: "location", label: "Location", placeholder: "Nairobi, Kenya", type: "text" },
      { key: "industry", label: "Industry", placeholder: "ICT, construction, cleaning, security, consulting", type: "text" },
      { key: "servicesProducts", label: "Services/products", placeholder: "List main services and products", type: "textarea" },
      { key: "targetClients", label: "Target clients", placeholder: "SMEs, county governments, corporates", type: "textarea" },
      { key: "visionMissionValues", label: "Vision, mission, values", placeholder: "Vision, mission, core values", type: "textarea" },
      { key: "teamProjectsCompliance", label: "Team, projects, compliance", placeholder: "Team details, past projects, licenses, certifications", type: "textarea" },
      { key: "contactDetails", label: "Contact details", placeholder: "Phone, email, website, address", type: "textarea" },
      { key: "profileLength", label: "Profile length", placeholder: "Short, standard, detailed, tender-ready", type: "text" },
      ...common
    ];
  }
  return [
    { key: "businessName", label: "Business name", placeholder: "Business name", type: "text" },
    { key: "industryLocation", label: "Industry and location", placeholder: "Food processing, Nairobi", type: "text" },
    { key: "businessModel", label: "Business model", placeholder: "B2B services, retail, subscriptions", type: "textarea" },
    { key: "productsServices", label: "Products/services", placeholder: "What the business sells", type: "textarea" },
    { key: "targetMarket", label: "Target market", placeholder: "Customers, segments, needs", type: "textarea" },
    { key: "startupCostsPricingRevenue", label: "Costs, pricing, revenue", placeholder: "Startup costs, pricing, revenue streams", type: "textarea" },
    { key: "competitorsMarketing", label: "Competitors and marketing", placeholder: "Competitors, positioning, marketing strategy", type: "textarea" },
    { key: "operationsTeam", label: "Operations and team", placeholder: "Operations plan, staffing, suppliers", type: "textarea" },
    { key: "financialFunding", label: "Financial assumptions and funding", placeholder: "Assumptions, funding needs, business stage", type: "textarea" },
    ...common
  ];
}
