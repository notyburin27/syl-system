import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"

const ALLOWED_HOST = "syl-files.sgp1.cdn.digitaloceanspaces.com"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = req.nextUrl.searchParams.get("url")
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 })

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 })
  }

  if (parsed.hostname !== ALLOWED_HOST) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const upstream = await fetch(url, { cache: "force-cache" })
  if (!upstream.ok) {
    return new NextResponse(null, { status: upstream.status })
  }

  const contentType = upstream.headers.get("content-type") ?? "image/jpeg"
  const body = await upstream.arrayBuffer()

  return new NextResponse(body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
    },
  })
}
