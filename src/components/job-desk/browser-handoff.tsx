"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Check, RefreshCw, Send, X, FileUp, Paperclip } from "lucide-react";

type Frame = { image?: string; url?: string; expiresAt?: string; submitted?: boolean; confirmation?: string; closed?: boolean; receipt?: { confirmation?: string } };
export function BrowserHandoff({ matchId }: { matchId: string }) {
  const [frame, setFrame] = useState<Frame>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [key, setKey] = useState("Tab");
  const request = useCallback(async (action?: object) => {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/admin/job-desk/handoff/${matchId}`, { method: action ? "POST" : "GET", headers: action ? { "Content-Type": "application/json" } : undefined, body: action ? JSON.stringify(action) : undefined, cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Session unavailable.");
      setFrame(result);
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Session unavailable."); return false; }
    finally { setBusy(false); }
  }, [matchId]);
  useEffect(() => { void request(); }, [request]);
  const finished = frame.submitted || frame.closed;
  const tool = "inline-flex h-10 w-10 shrink-0 items-center justify-center border border-black/20 disabled:opacity-40 dark:border-white/20";
  return <div className="mt-5 space-y-3">
    <div className="flex flex-wrap items-center gap-2 border-y border-black/15 py-3 dark:border-white/15">
      <button className={tool} title="Refresh browser" aria-label="Refresh browser" disabled={busy || finished} onClick={() => void request()}><RefreshCw size={18} /></button>
      <button className={tool} title="Scroll up" aria-label="Scroll up" disabled={busy || finished || !frame.image} onClick={() => void request({ action: "scroll", direction: "up" })}><ArrowUp size={18} /></button>
      <button className={tool} title="Scroll down" aria-label="Scroll down" disabled={busy || finished || !frame.image} onClick={() => void request({ action: "scroll", direction: "down" })}><ArrowDown size={18} /></button>
      <button className={tool} title="Attach this attempt's approved CV" aria-label="Attach this attempt's approved CV" disabled={busy || finished || !frame.image} onClick={() => void request({ action: "attach_cv" })}><FileUp size={18} /></button>
      <button className={tool} title="Attach this attempt's cover letter" aria-label="Attach this attempt's cover letter" disabled={busy || finished || !frame.image} onClick={() => void request({ action: "attach_letter" })}><Paperclip size={18} /></button>
      <button className={tool} title="Verify and record employer receipt" aria-label="Verify and record employer receipt" disabled={busy || finished} onClick={() => void request({ action: "verify" })}><Check size={18} /></button>
      <button className={tool} title="Close retained browser" aria-label="Close retained browser" disabled={busy || finished || !frame.image} onClick={() => void request({ action: "close" })}><X size={18} /></button>
      <span className="min-w-0 break-all text-xs text-black/60 dark:text-white/60">{frame.url}</span>
      {frame.expiresAt ? <span className="text-xs">Expires {new Date(frame.expiresAt).toLocaleTimeString()}</span> : null}
      {busy ? <span role="status" className="text-sm">Working...</span> : null}
    </div>
    {error ? <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p> : null}
    {frame.submitted ? <p role="status" className="font-semibold">Submitted and recorded. {frame.confirmation}</p> : null}
    {frame.receipt ? <p role="status" className="text-sm">Employer receipt available: {frame.receipt.confirmation}</p> : null}
    {frame.closed ? <p role="status">Browser closed. No submission inferred.</p> : null}
    {frame.image && !finished ? <>
      <div className="max-h-[70vh] overflow-auto border border-black/20 bg-white">
        <button className="block w-full cursor-crosshair disabled:cursor-wait" aria-label="Employer browser viewport" disabled={busy} onClick={event => {
          const image = event.currentTarget.querySelector("img");
          if (!image) return;
          const rect = image.getBoundingClientRect();
          void request({ action: "click", x: Math.floor((event.clientX - rect.left) * image.naturalWidth / rect.width), y: Math.floor((event.clientY - rect.top) * image.naturalHeight / rect.height) });
        }}><img src={frame.image} alt="Retained employer application" className="block h-auto w-full" draggable={false} /></button>
      </div>
      <form className="flex flex-wrap gap-2" onSubmit={async event => { event.preventDefault(); if (await request({ action: "type", text })) setText(""); }}>
        <input aria-label="Text for focused employer field" value={text} onChange={event => setText(event.target.value)} maxLength={2000} autoComplete="off" className="h-10 min-w-0 flex-1 border border-black/20 bg-transparent px-3 dark:border-white/20" disabled={busy} />
        <button className={tool} title="Enter text in focused field" aria-label="Enter text in focused field" disabled={busy || !text}><Send size={18} /></button>
        <select aria-label="Keyboard key" value={key} onChange={event => setKey(event.target.value)} disabled={busy} className="h-10 border border-black/20 bg-transparent px-2 dark:border-white/20">{["Tab", "Enter", "Backspace", "Escape", "ArrowDown", "ArrowUp", "Control+a"].map(value => <option key={value}>{value}</option>)}</select>
        <button type="button" className={tool} title="Press selected key" aria-label="Press selected key" disabled={busy} onClick={() => void request({ action: "key", key })}><Send size={18} /></button>
      </form>
    </> : null}
  </div>;
}
