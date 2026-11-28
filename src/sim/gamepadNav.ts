/**
 * Navegação espacial 2D pura para controle Xbox / PS4 (via DS4Windows) em menus e modais.
 */

export type NavDirection = 'up' | 'down' | 'left' | 'right';

export interface NavRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const GAMEPAD_ROOT_PRIORITY = ['pairing', 'changelog', 'outcome', 'pause', 'title'] as const;

/**
 * Seleciona o índice do próximo elemento focado com base na posição 2D dos retângulos.
 * Prioriza elementos na direção escolhida com alinhamento perpendicular próximo;
 * se não houver candidato naquela direção, mantém o foco atual.
 */
export function pickNextRectIndex(
  rects: readonly NavRect[],
  currentIndex: number,
  direction: NavDirection
): number {
  if (rects.length === 0) return -1;
  if (currentIndex < 0 || currentIndex >= rects.length) return 0;

  const cur = rects[currentIndex];
  const cx = cur.left + cur.width * 0.5;
  const cy = cur.top + cur.height * 0.5;

  let bestIndex = -1;
  let bestScore = Infinity;

  for (let i = 0; i < rects.length; i++) {
    if (i === currentIndex) continue;
    const r = rects[i];
    if (r.width <= 0 || r.height <= 0) continue;

    const rx = r.left + r.width * 0.5;
    const ry = r.top + r.height * 0.5;
    const dx = rx - cx;
    const dy = ry - cy;

    let primaryDist = 0;
    let secondaryDist = 0;

    if (direction === 'down') {
      if (dy <= 6) continue;
      primaryDist = Math.max(0, r.top - (cur.top + cur.height));
      if (primaryDist === 0) primaryDist = dy * 0.5;
      // Overlap horizontal recebe bônus forte para evitar pular para outra coluna sem necessidade
      const overlapX = Math.max(0, Math.min(cur.left + cur.width, r.left + r.width) - Math.max(cur.left, r.left));
      secondaryDist = overlapX > 4 ? Math.abs(dx) * 0.25 : Math.abs(dx) * 1.45;
    } else if (direction === 'up') {
      if (dy >= -6) continue;
      primaryDist = Math.max(0, cur.top - (r.top + r.height));
      if (primaryDist === 0) primaryDist = Math.abs(dy) * 0.5;
      const overlapX = Math.max(0, Math.min(cur.left + cur.width, r.left + r.width) - Math.max(cur.left, r.left));
      secondaryDist = overlapX > 4 ? Math.abs(dx) * 0.25 : Math.abs(dx) * 1.45;
    } else if (direction === 'right') {
      if (dx <= 6) continue;
      // Para esquerda/direita, exige alinhamento vertical próximo (mesma faixa de botões/tabs)
      const verticalSlack = Math.max(cur.height, r.height) * 0.95 + 14;
      if (Math.abs(dy) > verticalSlack) continue;
      primaryDist = Math.max(0, r.left - (cur.left + cur.width));
      if (primaryDist === 0) primaryDist = dx * 0.5;
      secondaryDist = Math.abs(dy) * 2.4;
    } else {
      if (dx >= -6) continue;
      const verticalSlack = Math.max(cur.height, r.height) * 0.95 + 14;
      if (Math.abs(dy) > verticalSlack) continue;
      primaryDist = Math.max(0, cur.left - (r.left + r.width));
      if (primaryDist === 0) primaryDist = Math.abs(dx) * 0.5;
      secondaryDist = Math.abs(dy) * 2.4;
    }

    const score = primaryDist + secondaryDist;
    if (score < bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return bestIndex !== -1 ? bestIndex : currentIndex;
}

/**
 * Encontra o contêiner de menu/modal ativo no topo da pilha de interface.
 */
export function findTopmostGamepadRoot(doc: Document = document): HTMLElement | null {
  for (const key of GAMEPAD_ROOT_PRIORITY) {
    const el = doc.querySelector<HTMLElement>(`[data-gamepad-root="${key}"]`);
    if (el) return el;
  }
  return null;
}

/**
 * Lista todos os elementos clicáveis visíveis e habilitados dentro de um contêiner de menu/modal.
 */
export function getGamepadFocusableElements(root: HTMLElement): HTMLElement[] {
  const candidates = root.querySelectorAll<HTMLElement>(
    'button:not(:disabled):not([tabindex="-1"]):not([data-gamepad-skip="true"]), a[href]:not([data-gamepad-skip="true"]), input:not([readonly]):not(:disabled):not([data-gamepad-skip="true"]), select:not(:disabled):not([data-gamepad-skip="true"])'
  );
  const visible: HTMLElement[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const el = candidates[i];
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    const style = window.getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    visible.push(el);
  }
  return visible;
}

/**
 * Garante visibilidade de um botão focado dentro de painéis com rolagem.
 */
export function scrollElementForGamepadFocus(el: HTMLElement): void {
  try {
    el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  } catch {
    try {
      el.scrollIntoView(false);
    } catch {
      // Ignore synthetic DOM errors
    }
  }
}

/**
 * Rola suavemente a área com scroll do painel ativo ao usar o analógico direito vertical.
 */
export function scrollActiveGamepadPanel(root: HTMLElement, stickY: number, dtSec: number): boolean {
  if (Math.abs(stickY) < 0.05) return false;
  const scroller =
    root.querySelector<HTMLElement>('[data-gamepad-scroll="true"]') ??
    (root.scrollHeight > root.clientHeight ? root : null);
  if (!scroller) return false;
  if (scroller.scrollHeight <= scroller.clientHeight + 2) return false;
  scroller.scrollTop += stickY * 520 * dtSec;
  return true;
}
