import { NextRequest, NextResponse } from "next/server";

export async function proxyJsonOrText(req: NextRequest, url: string, init: RequestInit) {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err: any) {
    return NextResponse.json(
      { error: "Auth service unreachable" },
      { status: 502 }
    );
  }

  const text = await res.text();
  const out = new NextResponse(text, { status: res.status });

  // Preserve content-type if provided
  const ct = res.headers.get("content-type");
  if (ct) out.headers.set("content-type", ct);

  // Forward cookies (supports multiple Set-Cookie headers where possible)
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) out.headers.append("set-cookie", setCookie);

  return out;
}
