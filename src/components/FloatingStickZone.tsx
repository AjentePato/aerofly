import { useEffect, useRef, useState } from 'react';
import {
  computeFloatingStickOrigin,
  computeFloatingStickValue,
  type FloatingOrigin,
  type StickVec,
} from '../sim/floatingStick';

export interface FloatingStickZoneProps {
  label: string;
  subLabel: string;
  side: 'left' | 'right';
  radiusPx?: number;
  variant?: 'controller' | 'overlay';
  invisible?: boolean;
  onStickSample: (pos: StickVec, immediate: boolean) => void;
}

/**
 * Dynamic floating virtual joystick zone.
 * Spawns centered at the exact initial touch/pointer position (0, 0 neutral),
 * updates the thumb knob at 60Hz via direct transform3d DOM refs, and snaps cleanly
 * back to (0, 0) on release or cancel.
 */
export function FloatingStickZone({
  label,
  subLabel,
  side,
  radiusPx = 68,
  variant = 'controller',
  invisible = false,
  onStickSample,
}: FloatingStickZoneProps) {
  const zoneRef = useRef<HTMLDivElement | null>(null);
  const knobRef = useRef<HTMLDivElement | null>(null);
  const readoutRef = useRef<HTMLDivElement | null>(null);
  const rectRef = useRef<DOMRect | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const originRef = useRef<FloatingOrigin | null>(null);
  const valueRef = useRef<StickVec>({ x: 0, y: 0 });
  const lastReadoutMsRef = useRef(0);
  const readoutTimerRef = useRef(0);
  const onStickSampleRef = useRef(onStickSample);
  onStickSampleRef.current = onStickSample;

  const [activeOrigin, setActiveOrigin] = useState<FloatingOrigin | null>(null);

  const syncVisuals = (pos: StickVec, forceReadout: boolean) => {
    if (knobRef.current) {
      const dx = pos.x * radiusPx;
      const dy = -pos.y * radiusPx;
      knobRef.current.style.transform = `translate3d(calc(-50% + ${dx}px), calc(-50% + ${dy}px), 0)`;
    }
    if (!readoutRef.current) return;

    const now = performance.now();
    const writeReadout = (v: StickVec) => {
      if (readoutRef.current) {
        readoutRef.current.textContent = `${subLabel} · ${Math.round(v.x * 100)}% / ${Math.round(v.y * 100)}%`;
      }
    };
    if (forceReadout || now - lastReadoutMsRef.current >= 65) {
      if (readoutTimerRef.current) {
        clearTimeout(readoutTimerRef.current);
        readoutTimerRef.current = 0;
      }
      lastReadoutMsRef.current = now;
      writeReadout(pos);
    } else if (!readoutTimerRef.current) {
      const wait = Math.max(8, 65 - (now - lastReadoutMsRef.current));
      readoutTimerRef.current = window.setTimeout(() => {
        readoutTimerRef.current = 0;
        lastReadoutMsRef.current = performance.now();
        writeReadout(valueRef.current);
      }, wait);
    }
  };

  // Sync newly mounted knob position right after activeOrigin flips on pointerdown
  useEffect(() => {
    if (activeOrigin) {
      syncVisuals(valueRef.current, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrigin, radiusPx]);

  const resetPointer = () => {
    if (pointerIdRef.current === null) return;
    pointerIdRef.current = null;
    originRef.current = null;
    rectRef.current = null;
    setActiveOrigin(null);
    const releaseVal: StickVec = { x: 0, y: 0 };
    valueRef.current = releaseVal;
    syncVisuals(releaseVal, true);
    onStickSampleRef.current(releaseVal, true);
  };

  // Reset stick cleanly if window loses focus, tab hides, or zone unmounts mid-drag
  useEffect(() => {
    const onBlurOrHide = () => {
      if (document.hidden || !document.hasFocus()) {
        resetPointer();
      }
    };
    window.addEventListener('blur', resetPointer);
    document.addEventListener('visibilitychange', onBlurOrHide);
    return () => {
      window.removeEventListener('blur', resetPointer);
      document.removeEventListener('visibilitychange', onBlurOrHide);
      if (readoutTimerRef.current) {
        clearTimeout(readoutTimerRef.current);
        readoutTimerRef.current = 0;
      }
      if (pointerIdRef.current !== null) {
        pointerIdRef.current = null;
        originRef.current = null;
        rectRef.current = null;
        valueRef.current = { x: 0, y: 0 };
        onStickSampleRef.current({ x: 0, y: 0 }, true);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toLocalCoords = (clientX: number, clientY: number) => {
    const rect = rectRef.current ?? zoneRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (pointerIdRef.current !== null) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic events without active pointer capture
    }
    pointerIdRef.current = e.pointerId;
    rectRef.current = e.currentTarget.getBoundingClientRect();

    const local = toLocalCoords(e.clientX, e.clientY);
    const origin = computeFloatingStickOrigin(local.x, local.y);
    originRef.current = origin;
    setActiveOrigin(origin);

    const nextVal = computeFloatingStickValue(local.x, local.y, origin, radiusPx);
    valueRef.current = nextVal;
    syncVisuals(nextVal, true);
    onStickSampleRef.current(nextVal, true);

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(6);
      } catch {
        // Ignore unsupported vibrate
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== e.pointerId || !originRef.current) return;
    const local = toLocalCoords(e.clientX, e.clientY);
    const nextVal = computeFloatingStickValue(
      local.x,
      local.y,
      originRef.current,
      radiusPx
    );
    valueRef.current = nextVal;
    syncVisuals(nextVal, false);
    onStickSampleRef.current(nextVal, false);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== e.pointerId) return;
    try {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore release errors
    }
    resetPointer();
  };

  const isOverlay = variant === 'overlay';
  const knobSizeClass = radiusPx <= 56 ? 'w-10 h-10' : 'w-12 h-12';

  return (
    <div
      ref={zoneRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onLostPointerCapture={handlePointerUp}
      role="application"
      aria-label={label}
      data-testid={side === 'left' ? 'left-stick-zone' : 'right-stick-zone'}
      data-stick-active={activeOrigin ? 'true' : 'false'}
      data-stick-invisible={invisible ? 'true' : 'false'}
      style={{ touchAction: 'none' }}
      className={`relative w-full h-full flex flex-col justify-end select-none overflow-hidden ${
        isOverlay
          ? 'items-stretch pb-3 px-3'
          : `items-center pb-4 cursor-crosshair ${side === 'left' ? 'border-r border-slate-800/80' : ''}`
      }`}
    >
      {/* Idle hint */}
      {!activeOrigin && !isOverlay && (
        <div className="pointer-events-none my-auto flex flex-col items-center gap-1.5 px-3 text-center">
          <div className="w-10 h-10 rounded-full border border-dashed border-slate-700/90 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-slate-600" />
          </div>
          <span className="text-xs font-medium text-slate-400">
            Toque em qualquer ponto
          </span>
        </div>
      )}

      {!activeOrigin && isOverlay && (
        <div
          className={`pointer-events-none absolute bottom-20 sm:bottom-8 ${
            side === 'left' ? 'left-3 sm:left-7' : 'right-3 sm:right-7'
          } flex flex-col items-center gap-1 transition-opacity duration-150 ${
            invisible ? 'opacity-0' : 'opacity-80'
          }`}
        >
          <div
            className="w-14 h-14 sm:w-20 sm:h-20 rounded-full border border-dashed border-slate-200/45 flex items-center justify-center"
            style={{ backgroundColor: 'rgba(8, 13, 24, 0.34)' }}
          >
            <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full border border-amber-400/55 bg-amber-400/20 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-amber-300" />
            </div>
          </div>
          <span
            className="text-[10px] font-mono font-semibold text-slate-200 tracking-wide whitespace-nowrap"
            style={{ textShadow: '0 1px 3px rgba(0, 0, 0, 0.9)' }}
          >
            {subLabel}
          </span>
        </div>
      )}

      {/* Floating Dynamic Virtual Stick — centered at the exact initial touch point */}
      {activeOrigin && (
        <div
          data-testid={side === 'left' ? 'left-stick-floating' : 'right-stick-floating'}
          className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-400/70 shadow-xl transition-opacity duration-150 ${
            invisible ? 'opacity-0' : 'opacity-100'
          }`}
          style={{
            left: `${activeOrigin.x}px`,
            top: `${activeOrigin.y}px`,
            width: `${radiusPx * 2}px`,
            height: `${radiusPx * 2}px`,
            backgroundColor: isOverlay ? 'rgba(8, 13, 24, 0.56)' : 'rgba(15, 23, 42, 0.75)',
          }}
        >
          {/* Center crosshairs */}
          <div className="absolute inset-x-3 top-1/2 h-px bg-slate-400/45" />
          <div className="absolute inset-y-3 left-1/2 w-px bg-slate-400/45" />
          <div className="absolute inset-5 rounded-full border border-slate-500/45" />

          {/* Moving thumb knob — updated via direct transform3d without React re-renders */}
          <div
            ref={knobRef}
            className={`absolute left-1/2 top-1/2 ${knobSizeClass} rounded-full bg-amber-500 border-4 border-slate-950 shadow-lg flex items-center justify-center will-change-transform`}
            style={{
              transform: 'translate3d(-50%, -50%, 0)',
            }}
          >
            <div className="w-3.5 h-3.5 rounded-full bg-amber-200/85" />
          </div>
        </div>
      )}

      {/* Controller mode bottom readout */}
      {!isOverlay && (
        <div className="pointer-events-none text-center px-2">
          <div className="text-xs font-display font-bold text-slate-200">{label}</div>
          <div ref={readoutRef} className="text-[11px] font-mono text-slate-400 tabular-nums">
            {subLabel} · 0% / 0%
          </div>
        </div>
      )}
    </div>
  );
}
