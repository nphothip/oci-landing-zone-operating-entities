import { NextResponse } from "next/server";
import { getPriceBook, refreshPriceBook } from "@/lib/pricing/cache";
import { catalogSkus } from "@/lib/pricing/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function summary() {
  const book = getPriceBook();
  const have = Object.keys(book.prices);
  const missing = catalogSkus().filter((s) => !have.includes(s));
  return {
    source: book.source,
    fetchedAt: book.fetchedAt,
    ageHours: Math.round((Date.now() - new Date(book.fetchedAt).getTime()) / 36000) / 100,
    skuCount: have.length,
    missingSkus: missing,
  };
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(summary());
}

export async function POST(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  if (url.searchParams.get("action") === "refresh") {
    await refreshPriceBook();
  }
  return NextResponse.json(summary());
}
