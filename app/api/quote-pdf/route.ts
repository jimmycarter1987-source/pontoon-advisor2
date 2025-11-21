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

    const pdfBuffer = await buildQuotePdfText(
      `Quote for ${answers?.name || "Customer"}`,
      lines,
      "Subject to lender approval."
    );

    // Convert the Buffer into an ArrayBuffer for the Web Response API
    const pdfArrayBuffer = pdfBuffer.buffer.slice(
      pdfBuffer.byteOffset,
      pdfBuffer.byteOffset + pdfBuffer.byteLength
    ) as ArrayBuffer;

    return new Response(pdfArrayBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": pdfBuffer.byteLength.toString()
      }
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
