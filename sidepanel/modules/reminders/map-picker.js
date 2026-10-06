// ── map-picker.js ────────────────────────────────────────────────────────
// Controlador interativo de mapa Leaflet para seleção de geolocalização.
// Permite clicar no mapa para marcar, arrastar o alfinete e ver o raio dinâmico.

/**
 * Garante que o Leaflet está carregado no ambiente do navegador.
 * @returns {Promise<any>}
 */
export async function ensureLeafletLoaded() {
  if (typeof window !== 'undefined' && window.L) return window.L;
  if (typeof document === 'undefined') return null;

  return new Promise((resolve) => {
    try {
      const script = document.createElement('script');
      let scriptSrc = 'vendor/leaflet/leaflet.js';
      if (typeof chrome !== 'undefined' && chrome?.runtime?.getURL) {
        scriptSrc = chrome.runtime.getURL('vendor/leaflet/leaflet.js');
      } else {
        const isSidepanel = typeof location !== 'undefined' && location.pathname.includes('/sidepanel/');
        scriptSrc = isSidepanel ? '../vendor/leaflet/leaflet.js' : 'vendor/leaflet/leaflet.js';
      }
      script.src = scriptSrc;
      script.onload = () => resolve(window.L || null);
      script.onerror = () => {
        const fallback = document.createElement('script');
        fallback.src = scriptSrc.includes('../') ? 'vendor/leaflet/leaflet.js' : '../vendor/leaflet/leaflet.js';
        fallback.onload = () => resolve(window.L || null);
        fallback.onerror = () => resolve(null);
        document.head.appendChild(fallback);
      };
      (document.head || document.documentElement).appendChild(script);
    } catch (_) {
      resolve(null);
    }
  });
}

/**
 * Cria e inicializa o mapa interativo Leaflet no container fornecido.
 * @param {HTMLElement} containerEl
 * @param {Object} options
 * @param {number|null} [options.lat]
 * @param {number|null} [options.lng]
 * @param {number} [options.radius=150]
 * @param {Function} [options.onLocationSelect] - (lat, lng) => void
 * @returns {Object} Instância controladora do mapa
 */
export function createMapPicker(containerEl, options = {}) {
  const {
    lat = null,
    lng = null,
    radius = 150,
    onLocationSelect = null
  } = options;

  let currentLat = lat;
  let currentLng = lng;
  let currentRadius = radius;
  let map = null;
  let marker = null;
  let circle = null;
  let isDestroyed = false;

  // Se Leaflet não estiver pronto imediatamente, tenta carregar dinamicamente
  if (typeof window === 'undefined' || !window.L) {
    ensureLeafletLoaded().then((L) => {
      if (L && !isDestroyed && containerEl) {
        initMap(L);
      }
    });

    return {
      panToLocation: (newLat, newLng) => {
        currentLat = newLat;
        currentLng = newLng;
        if (map) {
          map.setView([newLat, newLng], 16, { animate: true });
          renderizarElementos(newLat, newLng);
        }
      },
      updateRadius: (r) => {
        currentRadius = r;
        if (circle) circle.setRadius(r);
      },
      invalidateSize: () => {
        if (map) map.invalidateSize();
      },
      destroy: () => {
        isDestroyed = true;
        if (map) {
          try { map.remove(); } catch (_) {}
        }
      },
      isAvailable: false
    };
  }

  // Leaflet já está disponível
  return initMap(window.L);

  function initMap(L) {
    if (isDestroyed || !containerEl) return;

    // Coordenadas iniciais: se vazias, ponto neutro (São Paulo)
    const initialLat = currentLat ?? -23.55052;
    const initialLng = currentLng ?? -46.633308;
    const initialZoom = currentLat ? 16 : 13;

    try {
      map = L.map(containerEl, {
        zoomControl: true,
        attributionControl: false,
        scrollWheelZoom: true
      }).setView([initialLat, initialLng], initialZoom);

      // Camada de azulejos (Tiles) do OpenStreetMap com subdomínios balanceados
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        subdomains: ['a', 'b', 'c'],
        maxZoom: 19
      }).addTo(map);

      // Ícone visual do alfinete
      const pinIcon = L.divIcon({
        className: 'interactive-map-pin',
        html: `
          <div class="pin-bubble">
            <span class="pin-symbol">📍</span>
          </div>
          <div class="pin-pulse"></div>
        `,
        iconSize: [36, 42],
        iconAnchor: [18, 40]
      });

      function renderizarElementos(targetLat, targetLng) {
        if (targetLat == null || targetLng == null || !map) return;

        if (!marker) {
          marker = L.marker([targetLat, targetLng], {
            icon: pinIcon,
            draggable: true,
            title: 'Arraste para ajustar o ponto exato'
          }).addTo(map);

          marker.on('dragend', () => {
            const pos = marker.getLatLng();
            currentLat = pos.lat;
            currentLng = pos.lng;
            if (circle) circle.setLatLng(pos);
            onLocationSelect?.(pos.lat, pos.lng);
          });
        } else {
          marker.setLatLng([targetLat, targetLng]);
        }

        if (!circle) {
          circle = L.circle([targetLat, targetLng], {
            radius: currentRadius,
            color: 'oklch(54.6% 0.215 262.9)',
            fillColor: 'oklch(62.3% 0.188 259.8)',
            fillOpacity: 0.22,
            weight: 2
          }).addTo(map);
        } else {
          circle.setLatLng([targetLat, targetLng]);
          circle.setRadius(currentRadius);
        }
      }

      if (currentLat != null && currentLng != null) {
        renderizarElementos(currentLat, currentLng);
      }

      // Clique em qualquer ponto do mapa
      map.on('click', (e) => {
        const clickLat = e.latlng.lat;
        const clickLng = e.latlng.lng;
        currentLat = clickLat;
        currentLng = clickLng;

        renderizarElementos(clickLat, clickLng);
        onLocationSelect?.(clickLat, clickLng);
      });

      // Múltiplos ciclos de invalidateSize para garantir renderização perfeita após animações do popover
      requestAnimationFrame(() => map?.invalidateSize());
      setTimeout(() => map?.invalidateSize(), 60);
      setTimeout(() => map?.invalidateSize(), 180);
      setTimeout(() => map?.invalidateSize(), 350);

      return {
        isAvailable: true,
        mapInstance: map,
        panToLocation: (newLat, newLng, zoom = 16) => {
          currentLat = newLat;
          currentLng = newLng;
          if (map) {
            renderizarElementos(newLat, newLng);
            map.setView([newLat, newLng], zoom, { animate: true });
          }
        },
        updateRadius: (newRadius) => {
          currentRadius = newRadius;
          if (circle) circle.setRadius(newRadius);
        },
        invalidateSize: () => {
          if (map) map.invalidateSize();
        },
        destroy: () => {
          isDestroyed = true;
          if (map) {
            try { map.remove(); } catch (_) {}
          }
        }
      };
    } catch (err) {
      console.warn('Erro ao inicializar mapa Leaflet:', err);
      return {
        isAvailable: false,
        panToLocation: () => {},
        updateRadius: () => {},
        invalidateSize: () => {},
        destroy: () => {}
      };
    }
  }
}
