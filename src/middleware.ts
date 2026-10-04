import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options?: any };

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const hasSupabaseEnv = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const isDashboard = request.nextUrl.pathname.startsWith("/dashboard");
  const isAuth = request.nextUrl.pathname.startsWith("/login") || request.nextUrl.pathname.startsWith("/register");
  const isApi = request.nextUrl.pathname.startsWith("/api");
  const needsSession = isDashboard || isAuth || isApi;
  const supabaseDeadline = Date.now() + 12_000;

  function withSecurityHeaders(nextResponse: NextResponse) {
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
    const { data, error } = await supabase.auth.getUser();
    const upstreamFailure = error && typeof error.status === "number" && error.status >= 500;
    if (error && (upstreamFailure || error.name === "AuthRetryableFetchError")) {
      throw error;
    }
    user = data.user;
  } catch (error) {
    console.error("[middleware] Supabase auth check failed", {
      path: isDashboard ? "dashboard" : isApi ? "api" : "auth",
      error: error instanceof Error ? error.name : "unknown"
    });
    return withSecurityHeaders(new NextResponse("Authentication is temporarily unavailable. Please retry shortly.", { status: 503 }));
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
      const { data, error } = await supabase.from("users").select("status").eq("id", user.id).single();
      if (error && error.code !== "PGRST116") throw error;
      profile = data;
    } catch (error) {
      console.error("[middleware] Supabase profile check failed", {
        path: isDashboard ? "dashboard" : "api",
        error: error instanceof Error ? error.name : "unknown"
      });
      return withSecurityHeaders(new NextResponse("Account status is temporarily unavailable. Please retry shortly.", { status: 503 }));
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
