import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const tiers = await prisma.aprTier.findMany();
  const mins  = await prisma.termMinimum.findMany();

  const aprMatrix: Record<"Excellent"|"Good"|"Fair", {term:number; apr:number}[]> = {
    Excellent: [], Good: [], Fair: []
  };
  for (const t of tiers) {
    (aprMatrix as any)[t.tier]?.push({ term: t.term, apr: t.apr });
  }
  for (const key of Object.keys(aprMatrix) as (keyof typeof aprMatrix)[]) {
    aprMatrix[key].sort((a,b)=>a.term-b.term);
  }

  const minAmountByTerm = mins.reduce((acc, m) => { acc[String(m.term)] = m.amount; return acc; }, {} as Record<string, number>);
  return NextResponse.json({ aprMatrix, minAmountByTerm });
}

export async function PUT(req: Request) {
  const body = await req.json();
  const { aprMatrix, minAmountByTerm } = body ?? {};

  for (const tier of ["Excellent","Good","Fair"] as const) {
    const rows = aprMatrix?.[tier] ?? [];
    await prisma.aprTier.deleteMany({ where: { tier } });
    if (rows.length) {
      await prisma.aprTier.createMany({
        data: rows.map((r: any) => ({ tier, term: Number(r.term), apr: Number(r.apr) })),
      });
    }
  }

  await prisma.termMinimum.deleteMany();
  for (const [termStr, amount] of Object.entries(minAmountByTerm ?? {})) {
    await prisma.termMinimum.create({ data: { term: Number(termStr), amount: Number(amount) } });
  }

  return NextResponse.json({ ok: true });
}
