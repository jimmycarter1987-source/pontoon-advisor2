import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const { answers, selectedBoatId, finance, totals } = await req.json();
  const q = await prisma.quote.create({
    data: {
      customerName: answers?.name || null,
      customerEmail: answers?.email || null,
      customerPhone: answers?.phone || null,
      itemId: selectedBoatId || null,
      payloadJson: { answers, finance, totals },
    }
  });
  return NextResponse.json({ id: q.id });
}
