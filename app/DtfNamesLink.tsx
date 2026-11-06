import { NotebookPen } from "lucide-react";

export default function DtfNamesLink({ noteId, openNote }: { noteId?: string; openNote?: (id: string) => void }) {
  if (!noteId) return null;
  const label = "Lista de nomes";
  return openNote
    ? <button className="dtf-names-link" type="button" title="Abrir no Bloco de notas" onClick={() => openNote(noteId)}><NotebookPen size={14} /> {label}</button>
    : <a className="dtf-names-link" href={`#notas?nota=${encodeURIComponent(noteId)}`} title="Abrir o Bloco de notas em outra aba" target="_blank" rel="noopener noreferrer"><NotebookPen size={14} /> {label}</a>;
}
