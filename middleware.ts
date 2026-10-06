import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { renewalRouteDecision } from "@/lib/renewals/routeAccess"
import { readSessionRole } from "@/lib/renewals/sessionRole"

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow login page, API auth routes, and LINE webhook (authenticated by signature)
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/line/webhook")
  ) {
    return NextResponse.next()
  }

  // Check for session cookie
  const sessionToken = request.cookies.get("authjs.session-token") || request.cookies.get("__Secure-authjs.session-token")

  // Redirect to login if no session
  if (!sessionToken) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("callbackUrl", pathname)
    return NextResponse.redirect(loginUrl)
  }

  // สิทธิ์ของฟีเจอร์ต่ออายุรถ — ฝ่ายประกันเห็นเฉพาะ /renewals
  // (authorized() ใน lib/auth.ts ไม่ถูกเรียกเพราะ middleware นี้เขียนเอง จึงต้องเช็กที่นี่)
  const decision = renewalRouteDecision(await readSessionRole(
      request,
      request.cookies.getAll().map((c) => c.name),
      process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
    ), pathname)
  if (decision.kind === "forbidden") {
    return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้" }, { status: 403 })
  }
  if (decision.kind === "redirect") {
    return NextResponse.redirect(new URL(decision.to, request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api/auth (NextAuth.js routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files
     */
    "/((?!api/auth|api/line/webhook|_next/static|_next/image|favicon.ico|.*\\..*|login).*)",
  ],
}
