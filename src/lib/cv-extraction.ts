import mammoth from "mammoth";
import pdf from "pdf-parse/lib/pdf-parse.js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const MAX_EXTRACTED_CV_CHARS = 50000;

export type CvExtractionResult = {
  text: string;
  warning?: string;
};

function extensionFromName(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function normalizeExtractedText(value: string) {
  return value.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_EXTRACTED_CV_CHARS);
}

export async function extractTextFromCvFile(fileName: string, contentType: string, bytes: ArrayBuffer | Buffer): Promise<CvExtractionResult> {
  const extension = extensionFromName(fileName);

  if (extension === "txt" || contentType === "text/plain") {
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    return { text: normalizeExtractedText(buffer.toString("utf8")) };
  }

  if (extension === "docx" || contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    try {
      const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
      const result = await mammoth.extractRawText({ buffer });
      return {
        text: normalizeExtractedText(result.value),
        warning: result.messages.length ? "Some advanced Word formatting was ignored while reading the CV." : undefined
      };
    } catch {
      return { text: "", warning: "We saved the CV, but could not read this DOCX automatically. Paste the CV text below and generate again." };
    }
  }

  if (extension === "pdf" || contentType === "application/pdf") {
    try {
      const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
      const result = await pdf(buffer);
      const text = normalizeExtractedText(result.text);
      return text
        ? { text }
        : { text: "", warning: "The PDF appears to contain scanned images rather than selectable text. Paste the CV text or upload a text-based PDF/DOCX." };
    } catch {
      return { text: "", warning: "We saved the PDF, but could not read its text. Paste the CV text or upload a DOCX version." };
    }
  }

  return {
    text: "",
    warning: "We saved the CV. Paste the CV text below for legacy DOC uploads so the revamp can read it accurately."
  };
}

export async function extractTextFromStoredCv(userId: string, path: string, fileName: string, contentType: string): Promise<CvExtractionResult> {
  if (!path.startsWith(`${userId}/`)) {
    return { text: "", warning: "This uploaded CV does not belong to the current user." };
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.from("cv-uploads").download(path);

  if (error || !data) {
    return { text: "", warning: "We could not read the uploaded CV from storage. Upload it again or paste the CV text." };
  }

  return extractTextFromCvFile(fileName, contentType, await data.arrayBuffer());
}
