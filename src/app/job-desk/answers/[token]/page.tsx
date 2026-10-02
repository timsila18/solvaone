import type { Metadata } from "next";
import { loadAnswerRequest } from "@/lib/job-desk/answer-request";
import { AssistedAnswersForm } from "@/components/job-desk/assisted-answers-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Private application questions", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function ApplicationAnswersPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const request = await loadAnswerRequest(token);
  return <main className="min-h-screen bg-white px-5 py-12 text-black"><div className="mx-auto max-w-2xl">
    <h1 className="text-3xl font-black">Application questions</h1>
    {request ? <><p className="mt-4 leading-6">{request.name}, provide the missing facts for your applications below. This private link expires after 48 hours and works once. It does not change your application authorization.</p><AssistedAnswersForm token={token} questions={request.snapshot.questions} /></> : <p className="mt-4">This link has expired, was already used, or the order changed. Contact SolvaOne Job Desk on WhatsApp 0721537597 for a new link.</p>}
  </div></main>;
}
