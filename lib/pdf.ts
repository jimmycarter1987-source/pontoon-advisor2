import PDFDocument from "pdfkit";

export async function buildQuotePdf(payload: {
  headline: string;
  lines: string[];
  disclaimer?: string;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 36 });
    const chunks: Buffer[] = [];
    doc.on("data", (b) => chunks.push(b));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text(payload.headline, { underline: true });
    doc.moveDown();
    payload.lines.forEach((l) => doc.fontSize(11).text(l));
    doc.moveDown();
    doc.font("Times-Italic").fontSize(10).text(payload.disclaimer || "Subject to lender approval.");
    doc.end();
  });
}
