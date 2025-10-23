import { NextResponse } from "next/server";
import { buildQuotePdf } from "@/lib/pdf";

export async function POST(req: Request) {
  try {
    const { answers, selectedBoat, totals } = await req.json();
    const lines = [
      `Selected: ${selectedBoat.brand} ${selectedBoat.model} — $${selectedBoat.salePrice.toLocaleString()}`,
      `Out-the-door: $${Math.round(totals.outTheDoor).toLocaleString()}`,
      `Amount financed: $${Math.round(totals.amountToFinance).toLocaleString()}`,
      `Est. monthly (${totals.effectiveTerm} mo @ ${totals.aprUsed?.toFixed?.(2)}%): $${Math.round(totals.payment).toLocaleString()}`,
      ``,
      `Taxes: main $${Math.round(totals.taxBreakdown.taxMain).toLocaleString()}, trailer $${Math.round(totals.taxBreakdown.taxTrailer).toLocaleString()}`
    ];
    const pdf = await buildQuotePdf({
      headline: `Quote for ${answers?.name || "Customer"}`,
      lines,
      disclaimer: "Subject to lender approval."
    });
    return new NextResponse(pdf, { headers: { "Content-Type": "application/pdf" } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
