import { NextResponse } from "next/server";
import { handleDarajaCallback } from "@/lib/payments";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const result = await handleDarajaCallback(payload);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Callback handling failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
