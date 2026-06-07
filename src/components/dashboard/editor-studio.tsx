"use client";

import { Download, Loader2, Phone, Save, Sparkles } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { products, type ProductKey } from "@/lib/types";
import { formatKes } from "@/lib/utils";

type EditorStudioProps = {
  userId: string;
  productKey: ProductKey;
};

export function EditorStudio({ userId, productKey }: EditorStudioProps) {
  const product = products[productKey];
  const [projectId, setProjectId] = useState<string | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [title, setTitle] = useState(product.title);
  const [brief, setBrief] = useState("");
  const [html, setHtml] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState("Draft");
  const [isPending, startTransition] = useTransition();

  const canGenerate = useMemo(() => brief.trim().length > 40, [brief]);

  function saveDraft(nextHtml = html) {
    startTransition(async () => {
      setStatus("Saving");
      const response = await fetch("/api/documents/autosave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, documentId, product: productKey, title, brief, html: nextHtml })
      });
      const payload = await response.json();
      if (!response.ok) {
        setStatus(payload.error ?? "Save failed");
        return;
      }
      setProjectId(payload.projectId);
      setDocumentId(payload.documentId);
      setStatus("Saved");
    });
  }

  function generateDocument() {
    startTransition(async () => {
      setStatus("Generating");
      const saveResponse = await fetch("/api/documents/autosave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, documentId, product: productKey, title, brief, html })
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
        body: JSON.stringify({ projectId: saved.projectId, documentId: saved.documentId, product: productKey, title, brief })
      });
      const payload = await response.json();
      if (!response.ok) {
        setStatus(payload.error ?? "Generation failed");
        return;
      }
      setHtml(payload.html);
      setStatus("Ready");
    });
  }

  function startPayment() {
    startTransition(async () => {
      let activeProjectId = projectId;
      if (!activeProjectId) {
        setStatus("Saving");
        const saveResponse = await fetch("/api/documents/autosave", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, documentId, product: productKey, title, brief, html })
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
      setStatus("Requesting payment");
      const response = await fetch("/api/mpesa/stk-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: activeProjectId, product: productKey, phone })
      });
      const payload = await response.json();
      setStatus(response.ok ? "Payment requested" : payload.error ?? "Payment failed");
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
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-lg border border-black/10 p-5 dark:border-white/10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black">{product.title}</h1>
            <p className="mt-2 text-sm leading-6 text-black/55 dark:text-white/55">{product.description}</p>
          </div>
          <span className="rounded-lg bg-brand-blue px-3 py-2 text-sm font-black text-white">{formatKes(product.priceKes)}</span>
        </div>
        <div className="mt-6 space-y-4">
          <label className="block text-sm font-bold">
            Project title
            <Input className="mt-2" value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className="block text-sm font-bold">
            Source brief
            <Textarea
              className="mt-2 min-h-52"
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              placeholder="Paste role details, career history, business context, tender requirements, or planning notes."
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <Input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="2547XXXXXXXX" />
            <Button onClick={startPayment} disabled={isPending || !phone}>
              <Phone className="h-4 w-4" /> Pay with M-Pesa
            </Button>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => saveDraft()} disabled={isPending}>
              <Save className="h-4 w-4" /> Save
            </Button>
            <Button onClick={generateDocument} disabled={isPending || !canGenerate}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Generate
            </Button>
          </div>
          <p className="text-sm font-semibold text-black/55 dark:text-white/55">Status: {status}</p>
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
