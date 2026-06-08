import { NextResponse } from "next/server";
import { checkRateLimit, clientIpFromHeaders, rateLimitResponse } from "@/lib/security";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/server";

const allowedTypes = new Map([
  ["text/plain", "txt"],
  ["application/pdf", "pdf"],
  ["application/msword", "doc"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"]
]);

function extensionFromName(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function safeName(name: string) {
  const extension = extensionFromName(name);
  const base = name
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return `${base || "cv"}.${extension || "txt"}`;
}

export async function POST(request: Request) {
  const limited = checkRateLimit(`cv-upload:${clientIpFromHeaders(request.headers)}`, 10, 10 * 60 * 1000);
  if (!limited.allowed) return rateLimitResponse(limited.resetAt);

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Upload a CV file." }, { status: 400 });
  }

  const extension = extensionFromName(file.name);
  const inferredType = file.type || [...allowedTypes.entries()].find(([, ext]) => ext === extension)?.[0] || "";

  if (!allowedTypes.has(inferredType) || !["txt", "pdf", "doc", "docx"].includes(extension)) {
    return NextResponse.json({ error: "Upload a TXT, PDF, DOC, or DOCX CV." }, { status: 400 });
  }

  if (file.size > 8 * 1024 * 1024) {
    return NextResponse.json({ error: "CV upload limit is 8MB." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const path = `${user.id}/${Date.now()}-${safeName(file.name)}`;
  const bytes = await file.arrayBuffer();

  const { error } = await admin.storage.from("cv-uploads").upload(path, bytes, {
    contentType: inferredType,
    upsert: false
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let extractedText = "";
  if (extension === "txt") {
    extractedText = (await file.text()).slice(0, 20000);
  }

  await admin.from("audit_logs").insert({
    user_id: user.id,
    action: "cv.upload",
    entity_type: "storage_object",
    metadata: { bucket: "cv-uploads", path, fileName: file.name, fileSize: file.size, contentType: inferredType }
  });

  return NextResponse.json({
    file: {
      name: file.name,
      size: file.size,
      type: inferredType,
      path,
      parsed: Boolean(extractedText)
    },
    extractedText
  });
}
