"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import type { PdfReport } from "./pdf-report";

type Source = { report: PdfReport; generate?: never } | { report?: never; generate: () => Promise<void> };

export default function PdfDownloadButton({ report, generate, disabled }: Source & { disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function download() {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      if (generate) await generate();
      else await (await import("./pdf-report")).downloadReport(report);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return <>
    <button className="secondary" type="button" disabled={disabled || busy} onClick={() => void download()}>
      <Download size={16} aria-hidden="true" /> {busy ? "Gerando PDF…" : "Baixar PDF"}
    </button>
    {error && <span className="form-error" role="alert">Não foi possível baixar o PDF. Tente novamente.</span>}
  </>;
}
