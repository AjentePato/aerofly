import { useEffect, useState } from 'react';
import { getLoadingCopy, type LoadingOverlayState } from '../sim/loadingState';

interface LoadingOverlayProps {
  state: LoadingOverlayState | null;
}

export function LoadingOverlay({ state }: LoadingOverlayProps) {
  const [renderedState, setRenderedState] = useState<LoadingOverlayState | null>(state);
  const [visible, setVisible] = useState(Boolean(state));

  useEffect(() => {
    if (state) {
      setRenderedState(state);
      const raf = window.requestAnimationFrame(() => setVisible(true));
      return () => window.cancelAnimationFrame(raf);
    }

    setVisible(false);
    const timer = window.setTimeout(() => {
      setRenderedState(null);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [state]);

  if (!renderedState) return null;

  const copy = getLoadingCopy(renderedState.kind, renderedState.detail);

  return (
    <div
      data-testid="loading-overlay"
      data-loading-kind={renderedState.kind}
      role="status"
      aria-live="polite"
      aria-busy={Boolean(state)}
      className={`fixed inset-0 z-50 flex items-center justify-center p-6 bg-[#060a12]/92 backdrop-blur-md transition-opacity duration-200 ${
        visible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div className="w-full max-w-sm rounded-2xl border border-slate-700/80 bg-slate-900/95 p-6 shadow-2xl flex flex-col items-center text-center gap-4">
        {/* Animated Quadcopter Emblem */}
        <div className="relative w-16 h-16 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border border-amber-400/20 animate-ping" />
          <svg
            viewBox="0 0 64 64"
            className="w-14 h-14 text-amber-400"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="16"
              cy="16"
              r="9"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeDasharray="6 4"
              className="origin-[16px_16px] aeroload-spin-cw"
            />
            <circle
              cx="48"
              cy="16"
              r="9"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeDasharray="6 4"
              className="origin-[48px_16px] aeroload-spin-ccw"
            />
            <circle
              cx="16"
              cy="48"
              r="9"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeDasharray="6 4"
              className="origin-[16px_48px] aeroload-spin-ccw"
            />
            <circle
              cx="48"
              cy="48"
              r="9"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeDasharray="6 4"
              className="origin-[48px_48px] aeroload-spin-cw"
            />
            <path d="M16 16 L48 48 M48 16 L16 48" stroke="#cbd5e1" strokeWidth="3" strokeLinecap="round" />
            <rect x="25" y="23" width="14" height="18" rx="4" fill="#0f172a" stroke="#f8fafc" strokeWidth="2.2" />
            <circle cx="32" cy="27" r="2.3" fill="#38bdf8" />
          </svg>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-mono font-semibold tracking-widest text-amber-400 uppercase">
            {copy.badge}
          </span>
          <h2 className="font-display text-xl font-bold text-white tracking-tight">
            {copy.title}
          </h2>
          <p className="text-xs text-slate-300 leading-relaxed max-w-[280px]">
            {copy.subtitle}
          </p>
        </div>

        <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden border border-slate-700/60">
          <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-amber-500 via-amber-300 to-sky-400 aeroload-bar" />
        </div>
      </div>
    </div>
  );
}
