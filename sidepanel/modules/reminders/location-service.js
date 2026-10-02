// ── location-service.js ──────────────────────────────────────────────────
// Serviço de geocodificação direta e reversa via OpenStreetMap Nominatim.

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

/**
 * Busca endereços ou locais por texto livre.
 * @param {string} query
 * @returns {Promise<Array<{lat: number, lng: number, name: string, displayName: string}>>}
 */
export async function buscarLocaisPorTexto(query) {
  const q = (query || '').trim();
  if (!q) return [];

  const url = `${NOMINATIM_BASE}/search?format=json&q=${encodeURIComponent(q)}&limit=5&addressdetails=1`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' }
  });

  if (!res.ok) {
    throw new Error(`Falha na busca (${res.status})`);
  }

  const itens = await res.json();
  if (!Array.isArray(itens)) return [];

  return itens.map(item => {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    const shortName = extrairNomeCurto(item);
    return {
      lat,
      lng,
      name: shortName,
      displayName: item.display_name || shortName
    };
  });
}

/**
 * Realiza geocodificação reversa a partir de coordenadas GPS (lat, lng).
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<{name: string, displayName: string, city: string}>}
 */
export async function obterEnderecoPorCoordenadas(lat, lng) {
  if (lat == null || lng == null) return null;

  const url = `${NOMINATIM_BASE}/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' }
  });

  if (!res.ok) {
    throw new Error(`Falha na geocodificação reversa (${res.status})`);
  }

  const data = await res.json();
  const shortName = extrairNomeCurto(data);
  const city = data.address?.city || data.address?.town || data.address?.municipality || '';

  return {
    name: shortName,
    displayName: data.display_name || shortName,
    city
  };
}

/**
 * Extrai um nome curto e legível para a UI a partir do payload do Nominatim.
 */
function extrairNomeCurto(item) {
  if (!item) return 'Local selecionado';
  const addr = item.address || {};

  // 1. Nome de ponto de interesse ou edifício
  const poi = addr.shop || addr.amenity || addr.building || addr.office || addr.leisure;
  if (poi) {
    return poi.charAt(0).toUpperCase() + poi.slice(1);
  }

  // 2. Rua e número
  if (addr.road) {
    return addr.house_number ? `${addr.road}, ${addr.house_number}` : addr.road;
  }

  // 3. Nome do item ou primeiro pedaço do display_name
  if (item.name) return item.name;
  if (item.display_name) {
    return item.display_name.split(',')[0].trim();
  }

  return 'Local marcado no mapa';
}
