import { NextResponse, type NextRequest } from "next/server";

function hasSessionCookie(req: NextRequest): boolean {
  return Boolean(
    req.cookies.get("__Secure-authjs.session-token")?.value ||
      req.cookies.get("authjs.session-token")?.value,
  );
}

/**
 * - joinwaitlist.* → /waitlist rewrite
 * - /dashboard/* requires a session cookie (full check still happens in layout)
 */
export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") || "").toLowerCase();
  const { pathname, search } = req.nextUrl;

  if (host.startsWith("joinwaitlist.")) {
    if (
      pathname === "/" ||
      pathname === "" ||
      pathname === "/waitlist" ||
      pathname.startsWith("/waitlist/")
    ) {
      const url = req.nextUrl.clone();
      url.pathname = "/waitlist";
      url.protocol = "http:";
      const requestHeaders = new Headers(req.headers);
      requestHeaders.set("x-joinwaitlist", "1");
      return NextResponse.rewrite(url, {
        request: { headers: requestHeaders },
      });
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/dashboard") && !hasSessionCookie(req)) {
    const url = req.nextUrl.clone();
    url.pathname = "/auth";
    url.search = "";
    url.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/waitlist",
    "/waitlist/:path*",
    "/dashboard",
    "/dashboard/:path*",
  ],
};
