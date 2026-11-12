import html2canvas from "html2canvas-pro";
import { createA4Pdf, pdfFilename } from "./pdf-report";

export async function downloadProduction(source: HTMLElement, client: string) {
  const title = client ? `Lista de camisas · ${client}` : "Lista de camisas";
  const pdf = createA4Pdf(title);
  const sheets = Array.from(source.querySelectorAll<HTMLElement>(".production-sheet"));
  if (!sheets.length) throw new Error("Checklist indisponível");

  const stage = source.cloneNode(false) as HTMLElement;
  stage.classList.add("production-pdf-source");
  stage.setAttribute("aria-hidden", "true");
  document.body.append(stage);
  try {
    for (const [index, sheet] of sheets.entries()) {
      const page = sheet.cloneNode(true) as HTMLElement;
      stage.replaceChildren(page);
      await Promise.all(Array.from(page.querySelectorAll("img"), image => image.decode()));
      const canvas = await html2canvas(page, {
        scale: 2.25,
        backgroundColor: "#fff",
        logging: false,
        ignoreElements: element => element.parentElement === document.body && element !== stage,
        onclone: (doc, element) => {
          doc.body.style.zoom = "1";
          const container = element.parentElement;
          if (container) container.style.left = "0";
        },
      });
      const scale = Math.min(190 / canvas.width, 277 / canvas.height);
      if (index > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 10, 10, canvas.width * scale, canvas.height * scale, undefined, "FAST");
      canvas.width = canvas.height = 0;
    }
    pdf.save(pdfFilename(client ? `lista-de-camisas-${client}` : "lista-de-camisas"));
  } finally {
    stage.remove();
  }
}
