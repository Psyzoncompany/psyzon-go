"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, FilePlus2, FolderOpen, Search, SlidersHorizontal, X } from "lucide-react";
import { categories } from "../notes-model";
import "./mobile-note-controls.css";

type Section = "all" | "pinned" | "ready" | "archive" | "trash";
type Props = {
  section: Section;
  counts: Record<Section, number>;
  search: string;
  category: string;
  sort: "recent" | "title";
  onSection: (section: Section) => void;
  onSearch: (search: string) => void;
  onCategory: (category: string) => void;
  onSort: (sort: "recent" | "title") => void;
  onCreate: () => void;
};

export default function MobileNotesControls({ section, counts, search, category, sort, onSection, onSearch, onCategory, onSort, onCreate }: Props) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const searchButton = useRef<HTMLButtonElement>(null);
  const filterButton = useRef<HTMLButtonElement>(null);
  const categoryInput = useRef<HTMLSelectElement>(null);
  const popupId = useId();

  useEffect(() => { if (searchOpen) input.current?.focus(); }, [searchOpen]);
  useEffect(() => {
    if (!filtersOpen) return;
    categoryInput.current?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setFiltersOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [filtersOpen]);
  useEffect(() => {
    if (!filtersOpen && !searchOpen) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !root.current?.contains(document.activeElement)) return;
      event.stopPropagation();
      if (filtersOpen) { setFiltersOpen(false); filterButton.current?.focus(); }
      else { setSearchOpen(false); onSearch(""); requestAnimationFrame(() => searchButton.current?.focus()); }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [filtersOpen, searchOpen, onSearch]);

  function closeSearch() { setSearchOpen(false); onSearch(""); requestAnimationFrame(() => searchButton.current?.focus()); }
  function closeFilters() { setFiltersOpen(false); filterButton.current?.focus(); }

  return <div className="an-mobile-note-controls" role="group" aria-label="Controles das anotações" ref={root}>
    <h1 className="sr-only">Anotações</h1>
    <div className="an-mobile-note-bar">
      {searchOpen ? <label className="an-mobile-note-search"><Search size={17} aria-hidden="true" /><input ref={input} type="search" aria-label="Buscar anotações" placeholder="Buscar nas notas" value={search} onChange={event => onSearch(event.target.value)} /></label> : <label className="an-mobile-note-section"><FolderOpen size={18} aria-hidden="true" /><select aria-label="Visualizar anotações" value={section} onChange={event => onSection(event.target.value as Section)}>
        <option value="all">Todas ({counts.all})</option><option value="pinned">Fixadas ({counts.pinned})</option><option value="ready">Prontos ({counts.ready})</option><option value="archive">Arquivo ({counts.archive})</option><option value="trash">Lixeira ({counts.trash})</option>
      </select><ChevronDown size={14} aria-hidden="true" /></label>}
      {searchOpen ? <button type="button" aria-label="Fechar busca" onClick={closeSearch}><X size={18} /></button> : <button ref={searchButton} type="button" aria-label="Buscar anotações" onClick={() => { setFiltersOpen(false); setSearchOpen(true); }}><Search size={19} /></button>}
      <button ref={filterButton} type="button" aria-label="Filtrar e ordenar anotações" aria-expanded={filtersOpen} aria-controls={popupId} data-active={category !== "Todas" || sort !== "recent"} onClick={() => setFiltersOpen(value => !value)}><SlidersHorizontal size={19} /></button>
      <button type="button" className="an-mobile-note-create" aria-label="Nova anotação" onClick={() => { setFiltersOpen(false); onCreate(); }}><FilePlus2 size={20} /></button>
    </div>
    {filtersOpen && <div id={popupId} className="an-mobile-note-filters" role="group" aria-label="Filtros das anotações">
      <header><b>Filtrar e ordenar</b><button type="button" aria-label="Fechar filtros" onClick={closeFilters}><X size={18} /></button></header>
      <label>Categoria<select ref={categoryInput} aria-label="Filtrar por categoria" value={category} onChange={event => onCategory(event.target.value)}><option>Todas</option>{categories.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Ordenação<select aria-label="Ordenar anotações" value={sort} onChange={event => onSort(event.target.value as Props["sort"])}><option value="recent">Recentes</option><option value="title">Título A–Z</option></select></label>
      <footer><button type="button" onClick={() => { onCategory("Todas"); onSort("recent"); }}>Limpar filtros</button><button type="button" onClick={closeFilters}>Concluir</button></footer>
    </div>}
  </div>;
}
