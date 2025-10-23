import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const items = await prisma.inventoryItem.findMany({
    orderBy: [{ available: "desc" }, { updatedAt: "desc" }],
    include: { images: true },
  });
  return NextResponse.json(items);
}
