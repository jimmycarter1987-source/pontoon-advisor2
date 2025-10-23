import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const USER = process.env.BASIC_AUTH_USER || "";
const PASS = process.env.BASIC_AUTH_PASS || "";

function unauthorized() {
  return new NextResponse("Unauthorized", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="BoatWorld Admin"' },
  });
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const protectedPaths = ["/admin", "/api/config"];
  const needsAuth = protectedPaths.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (!needsAuth) return NextResponse.next();

  if (!USER || !PASS) return NextResponse.next(); // allow in dev if not set

  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Basic ")) return unauthorized();

  try {
    const [, b64] = auth.split(" ");
    const [u, p] = Buffer.from(b64, "base64").toString("utf8").split(":");
    if (u === USER && p === PASS) return NextResponse.next();
  } catch {}

  return unauthorized();
}

export const config = {
  matcher: ["/admin/:path*", "/api/config/:path*"],
};
