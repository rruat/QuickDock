// ── shell-mobile-gesture-math.js ────────────────────────────────────────────
// Matemática pura (sem DOM) dos gestos de drawer do mobile: posições durante o
// arrasto e decisão de concluir/reverter ao soltar. Testável em Node.

export const EDGE_ZONE_PX = 32;
export const AXIS_LOCK_PX = 10;
export const COMPLETE_FRACTION = 0.35;
export const FLICK_VELOCITY = 0.4; // px/ms
export const FLICK_MIN_PX = 20;

export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

// Sentido "a favor" do gesto: +1 se dx positivo ajuda a concluir, -1 se negativo.
const DIRECTION = {
  'open-left': 1,
  'open-right': -1,
  'close-left': -1,
  'close-right': 1
};

export function dragPositions(action, dx, leftW, rightW) {
  if (action === 'open-left') {
    const cur = clamp(dx, 0, leftW);
    return { push: cur, aside: cur - leftW, right: null };
  }
  if (action === 'open-right') {
    const cur = clamp(dx, -rightW, 0);
    return { push: cur, aside: null, right: rightW + cur };
  }
  if (action === 'close-left') {
    const cur = clamp(dx, -leftW, 0);
    return { push: leftW + cur, aside: cur, right: null };
  }
  if (action === 'close-right') {
    const cur = clamp(dx, 0, rightW);
    return { push: -rightW + cur, aside: null, right: cur };
  }
  return null;
}

// Velocidade (px/ms) a partir das últimas amostras [{x,t}] (janela ~100ms).
export function releaseVelocity(samples) {
  if (!samples || samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  let first = samples[0];
  for (let i = samples.length - 2; i >= 0; i--) {
    if (last.t - samples[i].t > 100) break;
    first = samples[i];
  }
  const dt = last.t - first.t;
  return dt > 0 ? (last.x - first.x) / dt : 0;
}

// true = conclui a ação (abrir/fechar); false = reverte ao estado anterior.
export function shouldComplete(action, dx, velocity, width) {
  const dir = DIRECTION[action];
  if (!dir || !(width > 0)) return false;
  const moved = Math.max(0, dx * dir);
  if (moved / width >= COMPLETE_FRACTION) return true;
  return velocity * dir >= FLICK_VELOCITY && moved >= FLICK_MIN_PX;
}
