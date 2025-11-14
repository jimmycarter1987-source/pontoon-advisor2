import { NextResponse } from "next/server";
import { prisma } from "../../../lib/db";   // <-- relative path

export async function GET() {
  const tiers = await prisma.aprTier.findMany();
  const mins  = await prisma.termMinimum.findMany();
  const aprMatrix: Record<"Excellent"|"Good"|"Fair", {term:number; apr:number}[]> = { Excellent: [], Good: [], Fair: [] };
  for (const t of tiers) (aprMatrix as any)[t.tier]?.push({ term: t.term, apr: t.apr });
  for (const k of Object.keys(aprMatrix) as (keyof typeof aprMatrix)[]) aprMatrix[k].sort((a,b)=>a.term-b.term);
  const minAmountByTerm = mins.reduce((acc, m) => { acc[String(m.term)] = m.amount; return acc; }, {} as Record<string, number>);
  return NextResponse.json({ aprMatrix, minAmountByTerm });
}

export async function PUT(req: Request) {
  const { aprMatrix, minAmountByTerm } = await req.json();
  for (const tier of ["Excellent","Good","Fair"] as const) {
    const rows = aprMatrix?.[tier] ?? [];
    await prisma.aprTier.deleteMany({ where: { tier } });
    if (rows.length) await prisma.aprTier.createMany({ data: rows.map((r: any) => ({ tier, term: +r.term, apr: +r.apr })) });
  }
  await prisma.termMinimum.deleteMany();
  for (const [termStr, amount] of Object.entries(minAmountByTerm ?? {})) {
    await prisma.termMinimum.create({ data: { term: +termStr, amount: +amount } });
  }
  return NextResponse.json({ ok: true });
}
