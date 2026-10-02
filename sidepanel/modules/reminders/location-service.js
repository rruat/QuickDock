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
    headers: { 'Accept': 'application/json', 'User-Agent': 'QuickDock/2.1' }
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
    headers: { 'Accept': 'application/json', 'User-Agent': 'QuickDock/2.1' }
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
 * Obtém a posição GPS atual do dispositivo com alta precisão e sem cache antigo.
 * @param {number} [timeoutMs=12000]
 * @returns {Promise<{lat: number, lng: number, accuracy: number}>}
 */
export function obterPosicaoGpsAltaPrecisao(timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return reject(new Error('Geolocalização não disponível no navegador (requer HTTPS ou localhost)'));
    }

    navigator.geolocation.getCurrentPosition(
      pos => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        });
      },
      err => {
        // Fallback: se alta precisão (satélite) falhou ou esgotou o tempo (ex: ambiente interno/PWA), tenta via rede/WiFi
        navigator.geolocation.getCurrentPosition(
          pos => {
            resolve({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy
            });
          },
          err2 => reject(err2 || err),
          {
            enableHighAccuracy: false,
            timeout: 8000,
            maximumAge: 30000
          }
        );
      },
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 0
      }
    );
  });
}

/**
 * Extrai o nome da rua, número e bairro legível para a UI a partir do payload do Nominatim.
 */
export function extrairNomeCurto(item) {
  if (!item) return 'Local selecionado';
  const addr = item.address || {};

  // 1. Identificar rua/via de circulação
  const rua = addr.road || addr.street || addr.pedestrian || addr.footway || addr.avenue || addr.highway || addr.path;
  const numero = addr.house_number || '';
  const bairro = addr.suburb || addr.neighbourhood || addr.quarter || '';
  const cidade = addr.city || addr.town || addr.municipality || addr.village || '';

  // 2. Se temos a rua identificada:
  if (rua) {
    let endereco = rua;
    if (numero) endereco += `, ${numero}`;
    if (bairro) endereco += ` - ${bairro}`;
    else if (cidade) endereco += ` - ${cidade}`;
    return endereco;
  }

  // 3. Se é ponto de interesse com nome real (não tags genéricas como 'yes')
  const poi = (typeof item.name === 'string' && item.name.length > 2 && item.name !== 'yes') ? item.name : null;
  if (poi) {
    if (bairro || cidade) return `${poi} (${bairro || cidade})`;
    return poi;
  }

  // 4. Primeiro pedaço significativo do display_name
  if (item.display_name) {
    const partes = item.display_name.split(',').map(p => p.trim()).filter(Boolean);
    if (partes.length >= 2) return `${partes[0]}, ${partes[1]}`;
    return partes[0] || 'Local marcado no mapa';
  }

  return 'Local marcado no mapa';
}
