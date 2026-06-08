import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options?: any };

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const hasSupabaseEnv = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const isDashboard = request.nextUrl.pathname.startsWith("/dashboard");
  const isAuth = request.nextUrl.pathname.startsWith("/login") || request.nextUrl.pathname.startsWith("/register");
  const isApi = request.nextUrl.pathname.startsWith("/api");

  function withSecurityHeaders(nextResponse: NextResponse) {
    nextResponse.headers.set("X-Frame-Options", "DENY");
    nextResponse.headers.set("X-Content-Type-Options", "nosniff");
    nextResponse.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    nextResponse.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    nextResponse.headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.clarity.ms https://connect.facebook.net https://analytics.tiktok.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co https://api.openai.com https://sandbox.safaricom.co.ke https://api.safaricom.co.ke https://www.google-analytics.com https://www.clarity.ms https://analytics.tiktok.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    );
    if (request.nextUrl.protocol === "https:") {
      nextResponse.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    }
    return nextResponse;
  }

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
      }
    }
  );

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (isDashboard && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return withSecurityHeaders(NextResponse.redirect(url));
  }

  if (isDashboard && user && !user.email_confirmed_at) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/verify";
    return withSecurityHeaders(NextResponse.redirect(url));
  }

  if ((isDashboard || isApi) && user) {
    const { data: profile } = await supabase.from("users").select("status").eq("id", user.id).single();
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
