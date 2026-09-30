import assert from "node:assert/strict";
import test from "node:test";
import { feedStillListsJob, fetchFeedJobs, isOfficialApplyUrl, normalizeFeedJob, recommendedSources, reviewReasons, vacancyFingerprint } from "../src/lib/job-desk/vacancy-feeds.ts";

test("catalogue contains verified provider types and no duplicate boards", () => {
  const keys = recommendedSources.map((source) => `${source.provider}:${source.site_token.toLowerCase()}`);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.some((key) => key.startsWith("ashby:")));
  assert.ok(keys.some((key) => key.startsWith("smartrecruiters:")));
});

test("only official board links for the configured company are accepted", () => {
  assert.equal(isOfficialApplyUrl("ashby", "lilt-production", "https://jobs.ashbyhq.com/lilt-production/123/application"), true);
  assert.equal(isOfficialApplyUrl("ashby", "lilt-production", "https://jobs.ashbyhq.com/other-company/123"), false);
  assert.equal(isOfficialApplyUrl("greenhouse", "canonical", "https://job-boards.greenhouse.io/canonical/jobs/123"), true);
  assert.equal(isOfficialApplyUrl("lever", "binance", "https://jobs.lever.co/binance/abc"), true);
  assert.equal(isOfficialApplyUrl("smartrecruiters", "Assent", "https://jobs.smartrecruiters.com/Assent/123"), true);
  assert.equal(isOfficialApplyUrl("lever", "binance", "http://jobs.lever.co/binance/abc"), false);
});

test("Ashby and SmartRecruiters jobs normalize to official application links", () => {
  const ashby = normalizeFeedJob({ provider: "ashby", site_token: "lilt-production", company_name: "LILT" }, { title: "Researcher", location: "Kenya", isRemote: true, descriptionPlain: "Build and review projects for clients.", publishedAt: "2026-09-01", jobUrl: "https://jobs.ashbyhq.com/lilt-production/123", applyUrl: "https://jobs.ashbyhq.com/lilt-production/123/application" });
  assert.equal(ashby?.workplace_type, "remote");
  assert.equal(ashby?.apply_url, "https://jobs.ashbyhq.com/lilt-production/123/application");
  const smart = normalizeFeedJob({ provider: "smartrecruiters", site_token: "Assent", company_name: "Assent" }, { id: "123", name: "Analyst", location: { fullLocation: "Eldoret, Kenya" }, applyUrl: "https://jobs.smartrecruiters.com/Assent/123", jobAd: { sections: { jobDescription: { text: "<p>Analyze data.</p>" } } } });
  assert.equal(smart?.description, "Analyze data.");
  assert.equal(smart?.location, "Eldoret, Kenya");
});

test("stale, thin and suspicious listings are flagged rather than matched", () => {
  const reasons = reviewReasons({ external_id: "1", company_name: "Example", title: "Analyst", location: "Nairobi", workplace_type: "onsite", description: "Pay an application fee and apply only via WhatsApp.", apply_url: "https://jobs.lever.co/example/1", source_updated_at: "2025-01-01T00:00:00.000Z" }, new Date("2026-09-30"));
  assert.ok(reasons.includes("old_published_date"));
  assert.ok(reasons.includes("thin_description"));
  assert.ok(reasons.includes("payment_request_language"));
  assert.ok(reasons.includes("messaging_only_application"));
  assert.equal(vacancyFingerprint({ company_name: "Watu Credit", title: "Data Analyst", location: "Nairobi, Kenya" }), vacancyFingerprint({ company_name: "WATU-CREDIT", title: "Data analyst", location: "Nairobi Kenya" }));
});

test("explicitly expired application deadlines require review", () => {
  const reasons = reviewReasons({ external_id: "2", company_name: "Example", title: "Analyst", location: "Nairobi", workplace_type: "onsite", description: "Application deadline: 2026-09-01. Join the Nairobi research team to analyze customer outcomes and prepare monthly reports for operational leaders.", apply_url: "https://jobs.lever.co/example/2", source_updated_at: "2026-09-29T00:00:00.000Z" }, new Date("2026-09-30"));
  assert.ok(reasons.includes("expired_deadline"));
});

test("Ashby fetch uses the official public endpoint", async () => {
  const oldFetch = globalThis.fetch;
  let url = "";
  globalThis.fetch = async (input) => { url = String(input); return new Response(JSON.stringify({ jobs: [{ title: "Role" }] }), { status: 200 }); };
  try {
    const jobs = await fetchFeedJobs({ provider: "ashby", site_token: "lilt-production", company_name: "LILT" });
    assert.equal(jobs.length, 1);
    assert.equal(url, "https://api.ashbyhq.com/posting-api/job-board/lilt-production");
  } finally { globalThis.fetch = oldFetch; }
});

test("fresh source check rejects a job removed from its official feed", async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ jobs: [{ id: 123, title: "Current role" }] }), { status: 200 });
  try {
    const source = { provider: "greenhouse", site_token: "canonical", company_name: "Canonical" };
    assert.equal(await feedStillListsJob(source, "123"), true);
    assert.equal(await feedStillListsJob(source, "456"), false);
  } finally { globalThis.fetch = oldFetch; }
});
