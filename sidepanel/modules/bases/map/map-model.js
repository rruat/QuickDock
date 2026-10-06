// ── map-model.js ────────────────────────────────────────────────────────────
// Notas → pontos do mapa e agrupamento por grade (cluster) — PURO, sem Leaflet.

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null));
const lat_ok = v => v !== null && v >= -90 && v <= 90;
const lng_ok = v => v !== null && v >= -180 && v <= 180;

export function resolveMapConfig(view = {}) {
  const pin = view.pin && typeof view.pin === 'object' ? view.pin : {};
  const bool = (v, p) => (v === undefined ? p : v === true || v === 'true');
  return {
    location: view.location || null,
    colorBy: pin.colorBy || view.color?.by || null,
    cluster: bool(view.cluster, true),
    fit: bool(view.fit, true),
    height: Math.min(900, Math.max(240, Number(view.height) || 480)),
  };
}

/** Lê { lat, lng } de um valor de propriedade: objeto de localização, "lat,lng" ou [lat, lng]. */
export function parseLatLng(v) {
  if (v === null || v === undefined || v === '') return null;
  let lat = null, lng = null;
  if (Array.isArray(v) && v.length >= 2) { lat = num(v[0]); lng = num(v[1]); }
  else if (typeof v === 'object') { lat = num(v.lat ?? v.latitude); lng = num(v.lng ?? v.lon ?? v.longitude); }
  else if (typeof v === 'string') {
    const m = /^\s*(-?\d+(?:[.,]\d+)?)\s*[,;]\s*(-?\d+(?:[.,]\d+)?)\s*$/.exec(v);
    if (m) { lat = num(m[1].replace(',', '.')); lng = num(m[2].replace(',', '.')); }
  }
  return lat_ok(lat) && lng_ok(lng) ? { lat, lng } : null;
}

/** Primeira propriedade do schema que parece localização (tipo 'location'). */
export function pickDefaultLocationProp(schema = {}) {
  const p = Object.values(schema).find(d => d?.type === 'location');
  return p?.key || null;
}

/** @returns {{ points: Array<{id,note,title,lat,lng}>, noLocation: Object[] }} */
export function buildMapPoints(notes, cfg, getValue) {
  const points = [], noLocation = [];
  for (const n of notes) {
    const ll = cfg.location ? parseLatLng(getValue(n, cfg.location)) : null;
    if (ll) points.push({ id: String(n.id), note: n, title: n.title || n.titulo || 'Sem título', ...ll });
    else noLocation.push(n);
  }
  return { points, noLocation };
}

/** Caixa que contém todos os pontos (para "ajustar ao conteúdo"). null se não há pontos. */
export function boundsOf(points) {
  if (!points.length) return null;
  let s = 90, n = -90, w = 180, e = -180;
  for (const p of points) { s = Math.min(s, p.lat); n = Math.max(n, p.lat); w = Math.min(w, p.lng); e = Math.max(e, p.lng); }
  return { south: s, north: n, west: w, east: e };
}

/**
 * Agrupa pontos próximos numa grade. Tamanho da célula (graus) cai pela metade a cada nível
 * de zoom: 360 / 2^zoom × `pixels`/256. Acima de `zoomMaximo` não agrupa (cada ponto é seu).
 * @returns {Array<{ lat, lng, points: Array, key }>}
 */
export function clusterPoints(points, zoom, { pixels = 56, zoomMaximo = 15 } = {}) {
  if (zoom >= zoomMaximo || points.length < 2) return points.map(p => ({ lat: p.lat, lng: p.lng, points: [p], key: p.id }));
  const celula = (360 / 2 ** zoom) * (pixels / 256);
  const grade = new Map();
  for (const p of points) {
    const k = `${Math.floor((p.lat + 90) / celula)}:${Math.floor((p.lng + 180) / celula)}`;
    if (!grade.has(k)) grade.set(k, []);
    grade.get(k).push(p);
  }
  return [...grade.entries()].map(([k, ps]) => ({
    lat: ps.reduce((t, p) => t + p.lat, 0) / ps.length,
    lng: ps.reduce((t, p) => t + p.lng, 0) / ps.length,
    points: ps,
    key: ps.length === 1 ? ps[0].id : `c${k}`,
  }));
}
