import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { withinDeadline } from "./lib/request-deadline";

type CookieToSet = { name: string; value: string; options?: any };

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const hasSupabaseEnv = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const isDashboard = request.nextUrl.pathname.startsWith("/dashboard");
  const isAuth = request.nextUrl.pathname.startsWith("/login") || request.nextUrl.pathname.startsWith("/register");
  const isApi = request.nextUrl.pathname.startsWith("/api");
  // Public auth pages must remain available when the upstream Auth database is
  // recovering. They perform their own credential request only on form submit.
  // The worker authenticates its own service tokens; a browser session lookup
  // must not make scheduler execution depend on the upstream Auth service.
  const independentlyAuthenticated = new Set([
    "/api/job-desk/worker", "/api/job-desk/intake", "/api/job-desk/payment-status",
    "/api/job-desk/payment-retry", "/api/job-desk/authorize", "/api/job-desk/authorize-batch",
    "/api/job-desk/answers", "/api/job-desk/email-events", "/api/job-desk/employers"
  ]);
  const needsSession = isDashboard || (isApi && !independentlyAuthenticated.has(request.nextUrl.pathname));
  const startedAt = Date.now();
  let supabaseDeadline = startedAt + 10_000;
  const refreshedCookies = new Map<string, CookieToSet>();

  function withSecurityHeaders(nextResponse: NextResponse) {
    for (const { name, value, options } of refreshedCookies.values()) nextResponse.cookies.set(name, value, options);
    if (needsSession) nextResponse.headers.set("Cache-Control", "private, no-store");
    nextResponse.headers.set("X-Frame-Options", "DENY");
    nextResponse.headers.set("X-Content-Type-Options", "nosniff");
    nextResponse.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    nextResponse.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    nextResponse.headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.clarity.ms https://connect.facebook.net https://analytics.tiktok.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co https://api.openai.com https://sandbox.safaricom.co.ke https://api.safaricom.co.ke https://www.google-analytics.com https://www.clarity.ms https://analytics.tiktok.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    );
    if (request.nextUrl.pathname.startsWith("/job-desk/answers/") || request.nextUrl.pathname.startsWith("/job-desk/authorize") || request.nextUrl.pathname === "/api/job-desk/answers") {
      nextResponse.headers.set("Referrer-Policy", "no-referrer");
      nextResponse.headers.set("Cache-Control", "private, no-store");
      nextResponse.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
      nextResponse.headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    }
    if (request.nextUrl.protocol === "https:") {
      nextResponse.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    }
    return nextResponse;
  }

  function unavailable(stage: "authentication" | "account") {
    const message = stage === "account" ? "We could not check your account right now." : "We could not verify your session right now.";
    const headers = { "Retry-After": "5", "Cache-Control": "private, no-store" };
    if (isApi) return withSecurityHeaders(NextResponse.json({ error: message, code: "ACCOUNT_CHECK_UNAVAILABLE", retryable: true }, { status: 503, headers }));
    return withSecurityHeaders(new NextResponse(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>SolvaOne | Please retry</title><style>body{font:16px system-ui;margin:0;background:#f5f7fa;color:#17202a}main{max-width:480px;margin:15vh auto;padding:24px}h1{font-size:24px}a{display:inline-block;padding:12px 20px;background:#065dff;color:white;text-decoration:none;border-radius:6px}</style><main><p>SolvaOne</p><h1>${message}</h1><p>Your session and saved work have not been removed. Please try again shortly.</p><a href="">Retry</a></main></html>`, { status: 503, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } }));
  }

  function logFailure(stage: string, error: unknown) {
    const details = error as { name?: unknown; code?: unknown; status?: unknown } | null;
    console.error(`[middleware] Supabase ${stage} check failed`, {
      path: isDashboard ? "dashboard" : "api",
      error: typeof details?.name === "string" ? details.name.slice(0, 60) : "upstream_error",
      code: typeof details?.code === "string" && /^[A-Z0-9_]{1,30}$/.test(details.code) ? details.code : undefined,
      status: typeof details?.status === "number" ? details.status : undefined,
      elapsedMs: Date.now() - startedAt
    });
  }

  if (!needsSession) return withSecurityHeaders(response);

  if (!hasSupabaseEnv) {
    if (isDashboard) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return withSecurityHeaders(NextResponse.redirect(url));
    }
    return withSecurityHeaders(response);
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(cookie => refreshedCookies.set(cookie.name, cookie));
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        }
      },
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
          const timeout = AbortSignal.timeout(Math.max(1, supabaseDeadline - Date.now()));
          const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
          return fetch(input, { ...init, signal });
        }
      }
    }
  );

  let user;
  try {
    const { data, error } = await withinDeadline(supabase.auth.getClaims(), 8_000);
    const upstreamFailure = error && typeof error.status === "number" && (error.status >= 500 || error.status === 429 || error.status === 402);
    if (error && (upstreamFailure || error.name === "AuthRetryableFetchError")) {
      throw error;
    }
    user = data?.claims?.sub ? { id: data.claims.sub } : null;
  } catch (error) {
    logFailure("auth", error);
    return unavailable("authentication");
  }

  if (isDashboard && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return withSecurityHeaders(NextResponse.redirect(url));
  }

  if ((isDashboard || isApi) && user) {
    let profile;
    try {
      // Auth latency must not consume the account query's entire budget.
      // Retry only this read, and only for transient upstream failures.
      for (let attempt = 0; attempt < 2; attempt++) {
        supabaseDeadline = Date.now() + (attempt === 0 ? 6_000 : 3_000);
        const timeoutMs = attempt === 0 ? 5_000 : 2_000;
        const { data, error, status } = await withinDeadline(supabase.from("users").select("status").eq("id", user.id).abortSignal(AbortSignal.timeout(timeoutMs)).retry(false).maybeSingle(), timeoutMs);
        if (!error) { profile = data; break; }
        if (attempt === 0 && (status >= 500 || status === 0 || error.code === "57014" || error.code === "PGRST003")) continue;
        throw { ...error, status };
      }
      if (!profile?.status) throw { code: "PROFILE_MISSING" };
    } catch (error) {
      logFailure("profile", error);
      return unavailable("account");
    }
    if (profile?.status && profile.status !== "active") {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("error", "disabled");
      return withSecurityHeaders(NextResponse.redirect(url));
    }
  }

  if (isAuth && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return withSecurityHeaders(NextResponse.redirect(url));
  }

  return withSecurityHeaders(response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};
