import { NextResponse } from "next/server";
import { prisma } from "../../../lib/db";   // <-- relative path

export async function GET() {
  const items = await prisma.inventoryItem.findMany({ orderBy: [{ updatedAt: "desc" }], include: { images: true } });
  return NextResponse.json(items);
}
