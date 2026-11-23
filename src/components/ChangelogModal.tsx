/**
 * Modal de histórico de atualizações ("Novidades!") exibido a partir do menu inicial.
 * Apresenta a evolução detalhada do simulador por versão, com filtro entre recursos (V1.X)
 * e pequenas correções/ajustes (V1.X.Y).
 */
import { useEffect, useState } from 'react';
import { Sparkles, Wrench, X } from 'lucide-react';
import {
  CHANGELOG_ENTRIES,
  GAME_VERSION,
  filterChangelogEntries,
  type ChangelogEntry,
  type ChangelogFilter,
} from '../sim/changelog';

interface ChangelogModalProps {
  onClose: () => void;
}

const FILTER_OPTIONS: Array<{ id: ChangelogFilter; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'features', label: 'Recursos (V1.X / V2.X)' },
  { id: 'fixes', label: 'Correções (V1.X.Y)' },
];

function getBadgeStyle(entry: ChangelogEntry): string {
  if (entry.kind === 'fix') {
    return 'bg-sky-500/15 text-sky-300 border-sky-500/40';
  }
  return 'bg-amber-500/15 text-amber-300 border-amber-500/40';
}

function getCategoryStyle(category: 'Novo' | 'Melhoria' | 'Correção'): string {
  if (category === 'Novo') return 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30';
  if (category === 'Correção') return 'text-sky-300 bg-sky-500/15 border-sky-500/30';
  return 'text-amber-300 bg-amber-500/15 border-amber-500/30';
}

export function ChangelogModal({ onClose }: ChangelogModalProps) {
  const [filter, setFilter] = useState<ChangelogFilter>('all');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const visibleEntries = filterChangelogEntries(CHANGELOG_ENTRIES, filter);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(6, 10, 18, 0.84)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="changelog-title"
    >
      <div
        className="w-full max-w-2xl rounded-xl border border-slate-700 p-5 md:p-6 text-slate-100 flex flex-col gap-4 max-h-[88vh]"
        style={{ backgroundColor: 'rgba(11, 17, 30, 0.98)' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-5 h-5 text-amber-400 shrink-0" aria-hidden="true" />
              <h2 id="changelog-title" className="font-display text-xl md:text-2xl font-bold text-white">
                Novidades e Atualizações
              </h2>
              <span className="text-xs font-mono text-slate-300 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded">
                {GAME_VERSION}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Histórico completo do simulador: versões principais (V1.X / V2.X) e correções rápidas (V1.X.Y).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar novidades"
            className="w-9 h-9 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white flex items-center justify-center shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar atualizações">
          {FILTER_OPTIONS.map((opt) => {
            const active = filter === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setFilter(opt.id)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                  active
                    ? 'bg-amber-500 text-slate-950 border-amber-400'
                    : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Scrollable Release Timeline */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-3" data-testid="changelog-list">
          {visibleEntries.map((entry) => {
            const isLatest = entry.version === GAME_VERSION;
            return (
              <article
                key={entry.version}
                data-testid={`changelog-entry-${entry.version}`}
                className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 flex flex-col gap-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`px-2 py-0.5 rounded border font-mono text-xs font-bold shrink-0 ${getBadgeStyle(entry)}`}
                    >
                      {entry.version}
                    </span>
                    <h3 className="font-display text-sm md:text-base font-bold text-white truncate">
                      {entry.title}
                    </h3>
                  </div>
                  <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1 shrink-0">
                    {entry.kind === 'fix' && <Wrench className="w-3 h-3 text-sky-400" aria-hidden="true" />}
                    {isLatest ? 'Versão Atual' : entry.kind === 'fix' ? 'Correção / Ajuste' : entry.kind === 'major' ? 'Base Inicial' : 'Atualização'}
                  </span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">{entry.summary}</p>

                <ul className="flex flex-col gap-1.5 pt-1">
                  {entry.changes.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-xs text-slate-200 leading-relaxed">
                      <span
                        className={`mt-0.5 px-1.5 py-0.5 rounded border text-[10px] font-semibold shrink-0 ${getCategoryStyle(item.category)}`}
                      >
                        {item.category}
                      </span>
                      <span>{item.text}</span>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-800">
          <span className="text-[11px] text-slate-400">
            {visibleEntries.length} {visibleEntries.length === 1 ? 'versão exibida' : 'versões exibidas'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-semibold text-white cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
