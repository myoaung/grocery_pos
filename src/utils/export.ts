import PDFDocument from "pdfkit";

export function toCsv(rows: Array<Record<string, string | number | boolean | null>>): string {
  if (rows.length === 0) {
    return "";
  }

  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];

  for (const row of rows) {
    const values = headers.map((header) => {
      const value = row[header];
      if (value === null || value === undefined) {
        return "";
      }
      const raw = String(value).replace(/"/g, '""');
      if (raw.includes(",") || raw.includes("\n")) {
        return `"${raw}"`;
      }
      return raw;
    });
    lines.push(values.join(","));
  }

  return lines.join("\n");
}

export async function toPdfBuffer(
  title: string,
  rows: Array<Record<string, string | number | boolean | null>>,
): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (error) => reject(error));

    doc.fontSize(16).text(title);
    doc.moveDown(1);

    if (rows.length === 0) {
      doc.fontSize(12).text("No rows available.");
      doc.end();
      return;
    }

    const headers = Object.keys(rows[0]);
    doc.fontSize(11).text(headers.join(" | "));
    doc.moveDown(0.5);

    for (const row of rows) {
      const line = headers.map((key) => String(row[key] ?? "")).join(" | ");
      doc.fontSize(10).text(line);
    }

    doc.end();
  });
}