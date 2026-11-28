import { useCallback, useEffect, useRef, useState } from 'react';
import {
  readBrowserGamepadButtons,
  triggerGamepadRumble,
  type GamepadButtonsSnapshot,
} from '../sim/gamepad';
import {
  findTopmostGamepadRoot,
  getGamepadFocusableElements,
  pickNextRectIndex,
  scrollActiveGamepadPanel,
  scrollElementForGamepadFocus,
  type NavDirection,
} from '../sim/gamepadNav';
import type { GamePhase } from '../sim/types';

export interface GamepadActionFeedback {
  label: string;
  nonce: number;
}

export interface UseGamepadUIOptions {
  active: boolean;
  phase: GamePhase;
  modalOpen: boolean;
  gamepadConnected: boolean;
  rumbleEnabled: boolean;
  onCloseTopModal: () => void;
  onCycleTab: (dir: -1 | 1) => void;
  onQuickStart: () => void;
  onToggleWind: () => void;
  onTogglePause: () => void;
  onCycleCamera: () => void;
  onCycleFlightMode: () => void;
  onToggleMute: () => void;
  onToggleHud: () => void;
  onRestart: () => void;
}

type ButtonKey = 'a' | 'b' | 'x' | 'y' | 'lb' | 'rb' | 'back' | 'start';

const NAV_INITIAL_DELAY_MS = 320;
const NAV_REPEAT_MS = 145;
const TRANSITION_GUARD_MS = 120;

function clearAllFocusMarkers(): void {
  if (typeof document === 'undefined') return;
  const prev = document.querySelectorAll<HTMLElement>('[data-gamepad-focused="true"]');
  for (let i = 0; i < prev.length; i++) {
    prev[i].removeAttribute('data-gamepad-focused');
  }
}

export function useGamepadUI(options: UseGamepadUIOptions): {
  focusActive: boolean;
  actionFeedback: GamepadActionFeedback | null;
  notifyActionFeedback: (label: string) => void;
} {
  const optRef = useRef(options);
  optRef.current = options;

  const [focusActive, setFocusActive] = useState(options.gamepadConnected);
  const focusActiveRef = useRef(focusActive);
  focusActiveRef.current = focusActive;

  const [actionFeedback, setActionFeedback] = useState<GamepadActionFeedback | null>(null);
  const feedbackTimerRef = useRef(0);
  const feedbackNonceRef = useRef(0);

  const focusedElRef = useRef<HTMLElement | null>(null);
  const activeRootKeyRef = useRef<string | null>(null);
  const blockedUntilReleaseRef = useRef<Set<ButtonKey>>(new Set());
  const guardUntilRef = useRef(0);
  const prevBtnRef = useRef<GamepadButtonsSnapshot | null>(null);
  const heldNavDirRef = useRef<NavDirection | null>(null);
  const nextNavRepeatAtRef = useRef(0);

  const notifyActionFeedback = useCallback((label: string) => {
    feedbackNonceRef.current += 1;
    setActionFeedback({ label, nonce: feedbackNonceRef.current });
    window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => {
      setActionFeedback(null);
    }, 1700);
  }, []);

  const applyFocusElement = useCallback((el: HTMLElement | null, shouldFocusActive = true) => {
    clearAllFocusMarkers();
    focusedElRef.current = el;
    if (el && shouldFocusActive) {
      el.setAttribute('data-gamepad-focused', 'true');
      scrollElementForGamepadFocus(el);
    }
  }, []);

  // Sync automatic visual focus activation when a controller connects
  useEffect(() => {
    if (options.gamepadConnected) {
      setFocusActive(true);
    } else {
      setFocusActive(false);
      clearAllFocusMarkers();
      focusedElRef.current = null;
    }
  }, [options.gamepadConnected]);

  // Hide gamepad focus ring cleanly when the user interacts with mouse/touch
  useEffect(() => {
    const onPointerDown = () => {
      if (focusActiveRef.current) {
        setFocusActive(false);
        clearAllFocusMarkers();
      }
    };
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, []);

  // Guard button state across phase / modal / active transitions so held buttons never double-trigger
  useEffect(() => {
    const snap = readBrowserGamepadButtons();
    const held = new Set<ButtonKey>();
    (['a', 'b', 'x', 'y', 'lb', 'rb', 'back', 'start'] as ButtonKey[]).forEach((k) => {
      if (snap[k]) held.add(k);
    });
    blockedUntilReleaseRef.current = held;
    guardUntilRef.current = performance.now() + TRANSITION_GUARD_MS;
    heldNavDirRef.current = null;
    prevBtnRef.current = snap;

    if (!options.active) {
      clearAllFocusMarkers();
      focusedElRef.current = null;
      activeRootKeyRef.current = null;
    }
  }, [options.active, options.phase, options.modalOpen]);

  useEffect(() => {
    let rafId = 0;
    let lastTs = performance.now();

    const step = (now: number) => {
      const dt = Math.min(0.1, Math.max(0.004, (now - lastTs) / 1000));
      lastTs = now;
      const cur = optRef.current;

      if (!cur.active) {
        rafId = window.requestAnimationFrame(step);
        return;
      }

      const snap = readBrowserGamepadButtons();
      const prev = prevBtnRef.current ?? snap;

      // Clear any blocked buttons once physically released
      if (blockedUntilReleaseRef.current.size > 0) {
        for (const k of Array.from(blockedUntilReleaseRef.current)) {
          if (!snap[k]) blockedUntilReleaseRef.current.delete(k);
        }
      }

      const justPressed = (k: ButtonKey): boolean => {
        if (!snap.connected) return false;
        if (now < guardUntilRef.current) return false;
        if (blockedUntilReleaseRef.current.has(k)) return false;
        return snap[k] && !prev[k];
      };

      const inMenuContext = cur.modalOpen || cur.phase !== 'playing';

      if (inMenuContext && snap.connected) {
        const root = findTopmostGamepadRoot();
        const rootKey = root?.getAttribute('data-gamepad-root') ?? null;

        if (root) {
          const items = getGamepadFocusableElements(root);

          // Scrollable list support with Right Stick Y (e.g. ChangelogModal or Title settings)
          if (Math.abs(snap.rightStickY) > 0.08) {
            scrollActiveGamepadPanel(root, snap.rightStickY, dt);
          }

          // Reconcile current focused element when root switches or React unmounts focused button
          let currentIdx = focusedElRef.current ? items.indexOf(focusedElRef.current) : -1;
          const rootChanged = rootKey !== activeRootKeyRef.current;
          if (rootChanged || currentIdx === -1) {
            activeRootKeyRef.current = rootKey;
            const defaultEl =
              root.querySelector<HTMLElement>('[data-gamepad-default="true"]') ??
              root.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
            const defaultIdx = defaultEl ? items.indexOf(defaultEl) : -1;
            const targetEl = defaultIdx >= 0 ? items[defaultIdx] : items[0] ?? null;
            applyFocusElement(targetEl, focusActiveRef.current);
            currentIdx = targetEl ? items.indexOf(targetEl) : -1;
          } else if (focusActiveRef.current && focusedElRef.current) {
            // Keep attribute alive if React re-rendered the node in place
            if (focusedElRef.current.getAttribute('data-gamepad-focused') !== 'true') {
              clearAllFocusMarkers();
              focusedElRef.current.setAttribute('data-gamepad-focused', 'true');
            }
          }

          // Directional navigation (D-pad or Left Stick) with hold auto-repeat
          const dir: NavDirection | null = snap.up
            ? 'up'
            : snap.down
              ? 'down'
              : snap.left
                ? 'left'
                : snap.right
                  ? 'right'
                  : null;

          if (dir) {
            const shouldMove =
              dir !== heldNavDirRef.current || now >= nextNavRepeatAtRef.current;
            if (shouldMove) {
              const firstWakeup = !focusActiveRef.current;
              if (firstWakeup) {
                setFocusActive(true);
                focusActiveRef.current = true;
              }
              if (dir !== heldNavDirRef.current) {
                heldNavDirRef.current = dir;
                nextNavRepeatAtRef.current = now + NAV_INITIAL_DELAY_MS;
              } else {
                nextNavRepeatAtRef.current = now + NAV_REPEAT_MS;
              }

              if (items.length > 0) {
                if (firstWakeup && currentIdx >= 0) {
                  applyFocusElement(items[currentIdx], true);
                  triggerGamepadRumble('nav', cur.rumbleEnabled);
                } else {
                  const rects = items.map((el) => {
                    const r = el.getBoundingClientRect();
                    return { left: r.left, top: r.top, width: r.width, height: r.height };
                  });
                  const nextIdx = pickNextRectIndex(rects, currentIdx >= 0 ? currentIdx : 0, dir);
                  if (nextIdx >= 0 && items[nextIdx]) {
                    if (nextIdx !== currentIdx) {
                      applyFocusElement(items[nextIdx], true);
                      triggerGamepadRumble('nav', cur.rumbleEnabled);
                    } else if (!focusActiveRef.current) {
                      applyFocusElement(items[nextIdx], true);
                    }
                  }
                }
              }
            }
          } else {
            heldNavDirRef.current = null;
          }

          // A / Cross (✕) -> Click focused control
          if (justPressed('a')) {
            setFocusActive(true);
            focusActiveRef.current = true;
            const target =
              (currentIdx >= 0 ? items[currentIdx] : null) ??
              root.querySelector<HTMLElement>('[data-gamepad-default="true"]') ??
              items[0] ??
              null;
            if (target) {
              applyFocusElement(target, true);
              triggerGamepadRumble('click', cur.rumbleEnabled);
              const labelText =
                target.getAttribute('aria-label') ||
                target.textContent?.trim().replace(/\s+/g, ' ').slice(0, 28) ||
                'Selecionado';
              notifyActionFeedback(`A / ✕ · ${labelText}`);
              target.click();
            }
          }
        }

        // B / Circle (○) -> Close modal, return/resume from pause, or return to title
        if (justPressed('b')) {
          setFocusActive(true);
          triggerGamepadRumble('tab', cur.rumbleEnabled);
          if (cur.modalOpen) {
            notifyActionFeedback('B / ○ · Fechar');
            cur.onCloseTopModal();
          } else if (cur.phase === 'paused') {
            notifyActionFeedback('B / ○ · Continuar Voo');
            cur.onTogglePause();
          } else if (cur.phase === 'gameover') {
            const titleBtn = findTopmostGamepadRoot()?.querySelector<HTMLElement>(
              '[data-gamepad-action="return-title"]'
            );
            if (titleBtn) {
              notifyActionFeedback('B / ○ · Menu Inicial');
              titleBtn.click();
            }
          }
        }

        // LB / RB (L1 / R1) -> Cycle tabs or changelog filters and align focus onto active tab
        if (justPressed('lb') || justPressed('rb')) {
          const isLb = justPressed('lb');
          setFocusActive(true);
          focusActiveRef.current = true;
          triggerGamepadRumble('tab', cur.rumbleEnabled);
          notifyActionFeedback(isLb ? 'LB / L1 · Aba Anterior' : 'RB / R1 · Próxima Aba');
          cur.onCycleTab(isLb ? -1 : 1);
          window.requestAnimationFrame(() => {
            const activeRoot = findTopmostGamepadRoot();
            if (!activeRoot) return;
            const nextTab =
              activeRoot.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ??
              activeRoot.querySelector<HTMLElement>('[aria-pressed="true"]');
            if (nextTab) {
              applyFocusElement(nextTab, true);
            }
          });
        }

        // Title-screen convenient shortcuts: Y / Start -> Iniciar Voo, X -> Vento
        if (!cur.modalOpen && cur.phase === 'title') {
          if (justPressed('y') || justPressed('start')) {
            triggerGamepadRumble('click', cur.rumbleEnabled);
            notifyActionFeedback('Iniciar Voo');
            cur.onQuickStart();
          } else if (justPressed('x')) {
            triggerGamepadRumble('click', cur.rumbleEnabled);
            notifyActionFeedback('X / □ · Vento');
            cur.onToggleWind();
          }
        } else if (!cur.modalOpen && cur.phase === 'paused') {
          if (justPressed('start')) {
            triggerGamepadRumble('tab', cur.rumbleEnabled);
            notifyActionFeedback('Start / Options · Continuar Voo');
            cur.onTogglePause();
          } else if (justPressed('back')) {
            triggerGamepadRumble('click', cur.rumbleEnabled);
            notifyActionFeedback('Back / Share · Reiniciar');
            cur.onRestart();
          }
        } else if (!cur.modalOpen && cur.phase === 'gameover') {
          if (justPressed('start') || justPressed('y')) {
            triggerGamepadRumble('click', cur.rumbleEnabled);
            notifyActionFeedback('Reiniciar / Avançar');
            cur.onQuickStart();
          }
        }
      } else if (cur.phase === 'playing' && !cur.modalOpen && snap.connected) {
        // Active flight shortcuts (never interferes with dual analog stick piloting)
        if (justPressed('start')) {
          triggerGamepadRumble('tab', cur.rumbleEnabled);
          notifyActionFeedback('Start / Options · Pausar');
          cur.onTogglePause();
        } else if (justPressed('y')) {
          triggerGamepadRumble('click', cur.rumbleEnabled);
          notifyActionFeedback('Y / △ · Trocar Câmera');
          cur.onCycleCamera();
        } else if (justPressed('x')) {
          triggerGamepadRumble('click', cur.rumbleEnabled);
          notifyActionFeedback('X / □ · Modo GPS / Sport');
          cur.onCycleFlightMode();
        } else if (justPressed('lb')) {
          triggerGamepadRumble('nav', cur.rumbleEnabled);
          notifyActionFeedback('LB / L1 · Som');
          cur.onToggleMute();
        } else if (justPressed('rb')) {
          triggerGamepadRumble('nav', cur.rumbleEnabled);
          notifyActionFeedback('RB / R1 · Exibir/Ocultar HUD');
          cur.onToggleHud();
        } else if (justPressed('back')) {
          triggerGamepadRumble('click', cur.rumbleEnabled);
          notifyActionFeedback('Back / Share · Reiniciar');
          cur.onRestart();
        }
      }

      prevBtnRef.current = snap;
      rafId = window.requestAnimationFrame(step);
    };

    rafId = window.requestAnimationFrame(step);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(feedbackTimerRef.current);
      clearAllFocusMarkers();
    };
  }, [applyFocusElement, notifyActionFeedback]);

  return { focusActive, actionFeedback, notifyActionFeedback };
}
