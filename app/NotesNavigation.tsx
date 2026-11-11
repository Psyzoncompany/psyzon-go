"use client";
import { Layers, ListChecks, NotebookPen, PackagePlus, Spool } from "lucide-react";
import type { View } from "./useViewHistory";
import "./notes/navigation.css";
export const noteViews: View[] = ["notas", "materiais", "afazeres", "reposicao", "costureiras"];
const pages = [{id:"notas",label:"Anotações",short:"Notas",icon:NotebookPen},{id:"materiais",label:"Materiais",short:"Materiais",icon:Layers},{id:"costureiras",label:"Costureiras",short:"Costura",icon:Spool},{id:"afazeres",label:"Afazeres",short:"Afazeres",icon:ListChecks},{id:"reposicao",label:"Reposição de estoque",short:"Estoque",icon:PackagePlus}] as const;
export default function NotesNavigation({view,navigate}:{view:View;navigate:(view:View)=>void}) {
  return <nav className="notes-page-nav" aria-label="Páginas do bloco de notas">{pages.map(({id,label,short,icon:Icon})=><button type="button" key={id} aria-label={label} aria-current={view===id?"page":undefined} onClick={()=>navigate(id)}><Icon size={17}/><span className="notes-nav-full">{label}</span><span className="notes-nav-short">{short}</span></button>)}</nav>;
}
