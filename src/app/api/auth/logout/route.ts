import { NextResponse } from "next/server";
import { buildLogoutCookie } from "@/lib/auth";

function noStoreHeaders() {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
  };
}

export async function POST() {
  const res = NextResponse.json(
    { ok: true },
    {
      status: 200,
      headers: noStoreHeaders(),
    }
  );

  // Expire the session cookie (HttpOnly, same path/domain as login cookie)
  res.headers.append("set-cookie", buildLogoutCookie());

  return res;
}
