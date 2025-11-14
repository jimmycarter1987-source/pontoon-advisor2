import { NextResponse } from "next/server";
import { buildQuotePdfText } from "../../../lib/pdf";

export async function POST(req: Request) {
  try {
    const { answers, selectedBoat, totals } = await req.json();
    const lines = [
      `Selected: ${selectedBoat.brand} ${selectedBoat.model} — $${selectedBoat.salePrice.toLocaleString()}`,
      `Out-the-door: $${Math.round(totals.outTheDoor).toLocaleString()}`,
      `Amount financed: $${Math.round(totals.amountToFinance).toLocaleString()}`,
      `Est. monthly (${totals.effectiveTerm} mo @ ${totals.aprUsed?.toFixed?.(2)}%): $${Math.round(totals.payment).toLocaleString()}`
    ];

    const pdf = await buildQuotePdfText(
      `Quote for ${answers?.name || "Customer"}`,
      lines,
      "Subject to lender approval."
    );

    // ✅ Use the web Response for Buffer bodies
    return new Response(pdf, { headers: { "Content-Type": "application/pdf" } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
