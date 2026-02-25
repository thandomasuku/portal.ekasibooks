import { NextResponse } from "next/server";

export const runtime = "nodejs";

type LatestManifest = {
  name?: string;
  version?: string;
  channel?: string;
  releaseDate?: string | null;
  sizeBytes?: number | null;
  sha256?: string | null;
  url?: string;
  highlights?: string[];
};

export async function GET() {
  const manifestUrl =
    process.env.NEXT_PUBLIC_DESKTOP_LATEST_MANIFEST_URL?.trim() ||
    "https://ekasibooks.co.za/downloads/desktop/latest.json";

  const fallbackExeUrl =
    process.env.NEXT_PUBLIC_DESKTOP_WIN_LATEST_URL?.trim() ||
    "https://ekasibooks.co.za/downloads/desktop/eKasiBooks-Setup.exe";

  try {
    const res = await fetch(manifestUrl, {
      // cache it a bit so your portal isn't hammering xneelo
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to fetch manifest (${res.status})`, manifestUrl },
        { status: 502 }
      );
    }

    const data = (await res.json()) as LatestManifest;

    // tiny sanity defaults
    const safe: LatestManifest = {
      name: data.name ?? "eKasiBooks Desktop (Windows)",
      version: data.version ?? "—",
      channel: data.channel ?? "Stable",
      releaseDate: data.releaseDate ?? null,
      sizeBytes: typeof data.sizeBytes === "number" ? data.sizeBytes : null,
      sha256: data.sha256 ?? null,
      // ✅ Fix: avoid mixing ?? and || without parentheses by using a precomputed fallback
      url: data.url ?? fallbackExeUrl,
      highlights: Array.isArray(data.highlights) ? data.highlights : [],
    };

    return NextResponse.json(safe, {
      headers: {
        // additional CDN/browser caching help (optional)
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to fetch manifest", manifestUrl },
      { status: 502 }
    );
  }
}