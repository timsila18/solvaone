export async function screenAutomaticCandidates<T>(
  candidates: T[],
  check: (candidate: T) => Promise<{ ready: boolean; blockers: string[] }>,
) {
  const ready: T[] = [];
  const skipped: { candidate: T; reason: string }[] = [];
  for (const candidate of candidates) {
    try {
      const result = await check(candidate);
      if (result.ready) ready.push(candidate);
      else skipped.push({ candidate, reason: result.blockers.join("; ") || "Required application details are unavailable." });
    } catch {
      // An unavailable employer schema must neither authorize a send nor stop other jobs.
      skipped.push({ candidate, reason: "Official application requirements could not be verified; deferred without submission." });
    }
  }
  return { ready, skipped };
}
