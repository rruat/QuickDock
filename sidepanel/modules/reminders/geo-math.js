// ── geo-math.js ──────────────────────────────────────────────────────────
// Funções puras de cálculo geodésico para verificação de proximidade e geocercas.
// Usa a fórmula de Haversine para precisão métrica.
// Sem DOM, 100% testável no Node.js.

const RAIO_TERRA_METROS = 6371000;

/**
 * Converte graus para radianos.
 */
function toRad(graus) {
  return (graus * Math.PI) / 180;
}

/**
 * Calcula a distância em metros entre duas coordenadas geográficas.
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} Distância em metros
 */
export function calcularDistanciaMetros(lat1, lon1, lat2, lon2) {
  if (
    typeof lat1 !== 'number' || typeof lon1 !== 'number' ||
    typeof lat2 !== 'number' || typeof lon2 !== 'number' ||
    !Number.isFinite(lat1) || !Number.isFinite(lon1) ||
    !Number.isFinite(lat2) || !Number.isFinite(lon2)
  ) {
    return Infinity;
  }

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return RAIO_TERRA_METROS * c;
}

/**
 * Determina se uma posição atual está dentro do raio de um alvo.
 * @param {{ lat: number, lng: number }} posAtual
 * @param {{ lat: number, lng: number, radius: number }} alvo
 * @returns {boolean}
 */
export function estaDentroDoRaio(posAtual, alvo) {
  if (!posAtual || !alvo || alvo.lat == null || alvo.lng == null) return false;
  const dist = calcularDistanciaMetros(posAtual.lat, posAtual.lng, alvo.lat, alvo.lng);
  return dist <= (alvo.radius || 150);
}

/**
 * Avalia se uma geocerca deve disparar com base na posição anterior e atual.
 * @param {{ lat: number, lng: number }|null} posAnterior
 * @param {{ lat: number, lng: number }} posAtual
 * @param {{ lat: number, lng: number, radius: number, triggerOn: 'enter'|'exit', triggered: boolean, active: boolean }} geocerca
 * @returns {{ deveDisparar: boolean, novoEstadoTriggered: boolean }}
 */
export function avaliarDisparoGeocerca(posAnterior, posAtual, geocerca) {
  if (!geocerca || geocerca.active === false || geocerca.lat == null || geocerca.lng == null) {
    return { deveDisparar: false, novoEstadoTriggered: false };
  }

  const dentroAgora = estaDentroDoRaio(posAtual, geocerca);
  const dentroAntes = posAnterior ? estaDentroDoRaio(posAnterior, geocerca) : false;

  if (geocerca.triggerOn === 'exit') {
    // Dispara ao sair
    if (dentroAntes && !dentroAgora && !geocerca.triggered) {
      return { deveDisparar: true, novoEstadoTriggered: true };
    }
    // Reseta quando volta a entrar
    if (dentroAgora && geocerca.triggered) {
      return { deveDisparar: false, novoEstadoTriggered: false };
    }
  } else {
    // Padrão: dispara ao chegar/entrar
    if (dentroAgora && !geocerca.triggered) {
      return { deveDisparar: true, novoEstadoTriggered: true };
    }
    // Reseta quando sai da cerca
    if (!dentroAgora && geocerca.triggered) {
      return { deveDisparar: false, novoEstadoTriggered: false };
    }
  }

  return { deveDisparar: false, novoEstadoTriggered: geocerca.triggered };
}
