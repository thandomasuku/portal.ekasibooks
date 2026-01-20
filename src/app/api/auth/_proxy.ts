import { NextRequest, NextResponse } from "next/server";
import { getApiBase } from "@/lib/apiBase";

export async function proxyJson(
  req: NextRequest,
  upstreamPath: string,
  method: "GET" | "POST" = "POST"
) {
  const base = getApiBase();
  if (!base) {
    return NextResponse.json(
      { error: "Server misconfiguration: EKASI_API_BASE_URL is not set" },
      { status: 500 }
    );
  }

  const url = `${base}${upstreamPath}`;

  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      // forward any existing cookies
      cookie: req.headers.get("cookie") ?? "",
    },
    redirect: "manual",
  };

  if (method === "POST") {
    init.body = await req.text();
  }

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

  // forward session cookie(s) back to the browser
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) out.headers.append("set-cookie", setCookie);

  // preserve content-type if backend returns json/text
  const ct = res.headers.get("content-type");
  if (ct) out.headers.set("content-type", ct);

  return out;
}
