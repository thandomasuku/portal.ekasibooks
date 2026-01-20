import { NextRequest, NextResponse } from "next/server";

import { getSessionCookieName } from "@/lib/auth";

/**
 * Middleware goal:
 * - Guard app pages that require login (fast check: session cookie presence).
 * - Do NOT block /api/* here (API routes verify session themselves; webhook must stay public).
 * - Do NOT try to verify JWT in middleware (Edge runtime + Node crypto mismatch).
 */

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/billing",
  "/settings",
  "/downloads", // 🔥 THIS WAS THE BUG
  "/account",
  "/support",
];

const PUBLIC_PATHS = new Set<string>([
  "/",
  "/login",
  "/register",
  "/forgot",
  "/reset",
  "/pricing",
  "/terms",
  "/privacy",
]);

function isProtectedPath(pathname: string) {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1) Never interfere with Next internals / static files
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/robots.txt") ||
    pathname.startsWith("/sitemap.xml") ||
    pathname.startsWith("/assets") ||
    pathname.startsWith("/images")
  ) {
    return NextResponse.next();
  }

  // 2) Do not gate API routes here.
  // Your API routes already validate sessions properly, and the Paystack webhook must remain public.
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // 3) Public pages are always accessible
  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  // 4) Protected pages need a session cookie (fast check)
  if (isProtectedPath(pathname)) {
    const cookieName = getSessionCookieName();
    const token = req.cookies.get(cookieName)?.value;

    if (!token) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

/**
 * Apply middleware to all routes except:
 * - static files
 * - next internal routes
 * We still handle /api inside middleware() early return.
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
