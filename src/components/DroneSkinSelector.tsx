import { Check } from 'lucide-react';
import { DRONE_SKINS } from '../sim/droneSkins';
import type { DroneSkinId } from '../sim/types';

interface DroneSkinSelectorProps {
  selectedSkin: DroneSkinId;
  onSelectSkin: (skin: DroneSkinId) => void;
  compact?: boolean;
}

export function DroneSkinSelector({
  selectedSkin,
  onSelectSkin,
  compact = false,
}: DroneSkinSelectorProps) {
  return (
    <div className="flex flex-col gap-2" role="radiogroup" aria-label="Texturas disponíveis para o drone">
      {DRONE_SKINS.map((skin) => {
        const active = selectedSkin === skin.id;
        return (
          <button
            key={skin.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onSelectSkin(skin.id)}
            className={`w-full text-left rounded-lg border transition-colors cursor-pointer ${
              compact ? 'p-2.5' : 'p-3.5'
            } ${
              active
                ? 'bg-amber-500/15 border-amber-400 text-white'
                : 'bg-slate-900/85 border-slate-700/85 text-slate-200 hover:border-slate-500'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                {/* Material color swatch strip */}
                <div
                  className={`flex items-center overflow-hidden rounded border border-slate-600/80 shrink-0 ${
                    compact ? 'h-6 w-11' : 'h-7 w-12'
                  }`}
                  aria-hidden="true"
                >
                  {skin.swatches.map((hex, idx) => (
                    <span
                      key={idx}
                      className="flex-1 h-full"
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-display text-sm font-bold text-white leading-tight">
                      {skin.name}
                    </span>
                    <span className="text-[10px] font-mono font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                      {skin.badge}
                    </span>
                  </div>
                </div>
              </div>

              <span
                className={`shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded ${
                  active
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {active && <Check className="w-3 h-3" aria-hidden="true" />}
                {active ? 'Ativo' : 'Usar'}
              </span>
            </div>

            <p className={`text-xs text-slate-300 leading-snug ${compact ? 'mt-1.5' : 'mt-2 leading-relaxed'}`}>
              {skin.description}
            </p>

            <div className={`flex flex-wrap gap-1.5 ${compact ? 'mt-1.5' : 'mt-2.5'}`}>
              {skin.details.map((detail) => (
                <span
                  key={detail}
                  className="text-[11px] px-2 py-0.5 rounded bg-slate-950/75 border border-slate-700/80 text-slate-300"
                >
                  {detail}
                </span>
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );
}
