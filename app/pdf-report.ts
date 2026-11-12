import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";

export type PdfCell = string | number | boolean;
export type PdfSection = { title?: string; columns: string[]; rows: PdfCell[][] };
export type PdfReport = {
  title: string;
  filename: string;
  subtitle?: string;
  text?: string;
  sections?: PdfSection[];
  photos?: string[];
  footer?: string;
};

export function createA4Pdf(title: string) {
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  pdf.setProperties({ title, creator: "PSYZON GO" });
  return pdf;
}

export function pdfFilename(name: string) {
  return (name.trim().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s+/g, "-").slice(0, 100) || "psyzon") + ".pdf";
}

export async function downloadReport(report: PdfReport) {
  const pdf = createA4Pdf(report.title);
  const margin = 13;
  const bottom = 282;
  const width = 210 - margin * 2;
  const ink = "#142951";
  let y = 21;

  function write(text: string, size = 10, bold = false) {
    pdf.setTextColor(ink);
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    const lineHeight = size * .44;
    for (const line of pdf.splitTextToSize(text, width) as string[]) {
      if (y + lineHeight > bottom) { pdf.addPage(); y = 18; }
      if (line) pdf.text(line, margin, y);
      y += lineHeight;
    }
  }

  pdf.setFillColor(ink);
  pdf.rect(margin, 12, width, 1.8, "F");
  write("PSYZON GO", 9, true);
  y += 3;
  write(report.title, 20, true);
  if (report.subtitle) write(report.subtitle);
  y += 4;
  if (report.text) { write(report.text); y += 3; }

  for (const section of report.sections ?? []) {
    if (y > bottom - 20) { pdf.addPage(); y = 18; }
    if (section.title) write(section.title, 12, true);
    const body = section.rows.map(row => row.map(cell => typeof cell === "boolean" ? "" : cell));
    const checkColumns = new Set(section.columns.flatMap((_, index) => typeof section.rows[0]?.[index] === "boolean" ? [index] : []));
    autoTable(pdf, {
      head: [section.columns],
      body,
      startY: y,
      margin: { top: 14, left: margin, right: margin, bottom: 16 },
      styles: { fontSize: 9, cellPadding: 2, textColor: ink },
      headStyles: { fillColor: ink, textColor: "#ffffff" },
      rowPageBreak: "avoid",
      didParseCell: ({ column, cell }) => {
        if (section.columns[column.index] === "Nº") cell.styles.cellWidth = 12;
        if (checkColumns.has(column.index)) {
          cell.styles.cellWidth = 20;
          cell.styles.halign = "center";
        }
      },
      didDrawCell: ({ section: part, row, column, cell }) => {
        const value = section.rows[row.index]?.[column.index];
        if (part !== "body" || typeof value !== "boolean") return;
        const x = cell.x + (cell.width - 3.5) / 2;
        const top = cell.y + (cell.height - 3.5) / 2;
        pdf.setDrawColor(ink).setLineWidth(.2).rect(x, top, 3.5, 3.5);
        if (value) pdf.line(x + .6, top + 1.7, x + 1.4, top + 2.6).line(x + 1.4, top + 2.6, x + 2.9, top + .8);
      },
      didDrawPage: ({ cursor }) => { if (cursor) y = cursor.y; },
    });
    y += 8;
  }

  for (const source of report.photos ?? []) {
    const image = new Image();
    image.src = source;
    await image.decode();
    const scale = Math.min(width / image.naturalWidth, 85 / image.naturalHeight);
    const imageWidth = image.naturalWidth * scale;
    const imageHeight = image.naturalHeight * scale;
    if (y + imageHeight > bottom) { pdf.addPage(); y = 18; }
    const canvas = document.createElement("canvas");
    const rasterScale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * rasterScale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * rasterScale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Foto indisponível");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    pdf.addImage(canvas.toDataURL("image/jpeg", .9), "JPEG", margin, y, imageWidth, imageHeight);
    y += imageHeight + 4;
  }
  if (report.footer) write(report.footer, 9, true);

  const pages = pdf.getNumberOfPages();
  for (let index = 1; index <= pages; index++) {
    pdf.setPage(index).setFont("helvetica", "normal").setFontSize(8).setTextColor("#526580");
    pdf.text(`${index} / ${pages}`, 210 - margin, 289, { align: "right" });
  }
  pdf.save(pdfFilename(report.filename));
}
