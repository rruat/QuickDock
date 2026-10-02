// ── map-picker.js ────────────────────────────────────────────────────────
// Controlador interativo de mapa Leaflet para seleção de geolocalização.
// Permite clicar no mapa para marcar, arrastar o alfinete e ver o raio dinâmico.

/**
 * Cria e inicializa o mapa interativo Leaflet no container fornecido.
 * @param {HTMLElement} containerEl
 * @param {Object} options
 * @param {number|null} [options.lat]
 * @param {number|null} [options.lng]
 * @param {number} [options.radius=150]
 * @param {Function} [options.onLocationSelect] - Chamado ao clicar ou arrastar o pino: (lat, lng) => void
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

  // Fallback caso Leaflet não esteja no escopo (ex: testes sem DOM completo)
  if (typeof window === 'undefined' || !window.L) {
    return {
      panToLocation: (newLat, newLng) => { currentLat = newLat; currentLng = newLng; },
      updateRadius: (r) => { currentRadius = r; },
      destroy: () => {},
      isAvailable: false
    };
  }

  // Coordenadas iniciais: se não definidas, inicia em SP ou centro neutro
  const initialLat = currentLat ?? -23.55052;
  const initialLng = currentLng ?? -46.633308;
  const initialZoom = currentLat ? 16 : 13;

  const map = window.L.map(containerEl, {
    zoomControl: true,
    attributionControl: false,
    scrollWheelZoom: true
  }).setView([initialLat, initialLng], initialZoom);

  // Camada de azulejos (Tiles) do OpenStreetMap
  window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(map);

  // Ícone visual do alfinete (nítido e estilizado)
  const pinIcon = window.L.divIcon({
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

  let marker = null;
  let circle = null;

  function renderizarElementos(targetLat, targetLng) {
    if (targetLat == null || targetLng == null) return;

    if (!marker) {
      marker = window.L.marker([targetLat, targetLng], {
        icon: pinIcon,
        draggable: true,
        title: 'Arraste para ajustar o ponto exato'
      }).addTo(map);

      // Evento de arrastar o alfinete
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
      circle = window.L.circle([targetLat, targetLng], {
        radius: currentRadius,
        color: 'var(--accent, #3b82f6)',
        fillColor: 'var(--accent, #3b82f6)',
        fillOpacity: 0.22,
        weight: 2
      }).addTo(map);
    } else {
      circle.setLatLng([targetLat, targetLng]);
      circle.setRadius(currentRadius);
    }
  }

  // Se já tem coordenadas salvas, desenha o marcador e círculo
  if (currentLat != null && currentLng != null) {
    renderizarElementos(currentLat, currentLng);
  }

  // Clique em qualquer ponto do mapa para selecionar ou mover
  map.on('click', (e) => {
    const clickLat = e.latlng.lat;
    const clickLng = e.latlng.lng;
    currentLat = clickLat;
    currentLng = clickLng;

    renderizarElementos(clickLat, clickLng);
    onLocationSelect?.(clickLat, clickLng);
  });

  // Força ajuste de tamanho após renderização no DOM
  setTimeout(() => {
    map.invalidateSize();
  }, 100);

  return {
    isAvailable: true,
    mapInstance: map,

    panToLocation: (newLat, newLng, zoom = 16) => {
      currentLat = newLat;
      currentLng = newLng;
      renderizarElementos(newLat, newLng);
      map.setView([newLat, newLng], zoom, { animate: true });
    },

    updateRadius: (newRadius) => {
      currentRadius = newRadius;
      if (circle) {
        circle.setRadius(newRadius);
      }
    },

    invalidateSize: () => {
      map.invalidateSize();
    },

    destroy: () => {
      try {
        map.remove();
      } catch (_) {}
    }
  };
}
