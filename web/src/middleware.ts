import { NextResponse, type NextRequest } from "next/server";

/** Host joinwaitlist.parthkadam.tech → /waitlist (keep /api/waitlist as-is). */
export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") || "").toLowerCase();
  if (!host.startsWith("joinwaitlist.")) {
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl;
  if (
    pathname === "/" ||
    pathname === "" ||
    pathname === "/waitlist" ||
    pathname.startsWith("/waitlist/")
  ) {
    // Behind nginx TLS, nextUrl is https — internal rewrite must stay http
    // or Next tries to proxy https://localhost:3010 and EPROTO 500s.
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

export const config = {
  matcher: ["/", "/waitlist", "/waitlist/:path*"],
};
