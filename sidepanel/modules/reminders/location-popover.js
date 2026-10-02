// ── location-popover.js ──────────────────────────────────────────────────
// Popover com Maps e busca de endereços para associar geolocalização à nota.
// Integra OpenStreetMap (Nominatim + Embed interativo) e Google Maps.

import { positionPopover } from '../popover.js';
import { updateNoteMetaById } from '../storage.js';
import { registrarGeocerca, desregistrarGeocerca } from './geo-watcher.js';

let activeLocationPopover = null;

export function closeLocationPopover() {
  if (activeLocationPopover) {
    activeLocationPopover.remove();
    activeLocationPopover = null;
  }
}

export function closeLocationPopoverIfOutside(target) {
  if (activeLocationPopover && !activeLocationPopover.contains(target) && !target.closest('#btn-note-header-location')) {
    closeLocationPopover();
  }
}

/**
 * Abre o popover de Localização & Maps ancorado em um elemento.
 * @param {HTMLElement} anchorEl
 * @param {Object} note
 * @param {Function} [onSaved]
 */
export function openLocationPopover(anchorEl, note, onSaved) {
  if (activeLocationPopover && activeLocationPopover.dataset.noteId === String(note.id)) {
    closeLocationPopover();
    return;
  }
  closeLocationPopover();
  if (!anchorEl || !note) return;

  const props = { ...(note.properties || {}) };
  const loc = (props.location && typeof props.location === 'object')
    ? props.location
    : { name: '', lat: null, lng: null, radius: 150 };

  const pop = document.createElement('div');
  pop.className = 'copy-menu location-popover';
  pop.dataset.noteId = String(note.id);

  let currentLat = loc.lat ?? null;
  let currentLng = loc.lng ?? null;
  let currentRadius = loc.radius || 150;
  let currentName = loc.name || '';

  const gerarIframeUrl = (lat, lng) => {
    const delta = 0.005;
    const left = lng - delta;
    const right = lng + delta;
    const bottom = lat - delta;
    const top = lat + delta;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${left}%2C${bottom}%2C${right}%2C${top}&layer=mapnik&marker=${lat}%2C${lng}`;
  };

  pop.innerHTML = `
    <div class="reminder-popover-header">
      <div class="popover-title-row">
        <span class="qd-icon material-symbols-rounded">location_on</span>
        <span class="popover-title">Localização & Mapa</span>
      </div>
      <button type="button" class="icon-btn location-close-btn" title="Fechar">
        <span class="qd-icon material-symbols-rounded">close</span>
      </button>
    </div>

    <div class="location-popover-body">
      <!-- Dica explicativa -->
      <div class="reminder-info-box">
        <span class="qd-icon material-symbols-rounded">pin_drop</span>
        <span>Pesquise qualquer endereço (ex: sua casa ou mercado). Quando você se aproximar do local, o alarme insistente tocará até você concluir!</span>
      </div>

      <!-- Busca de endereço -->
      <div class="location-search-row">
        <input type="text" id="location-search-input" class="property-input" placeholder="Buscar endereço (ex: Rua, Bairro, Casa)...">
        <button type="button" id="btn-search-address" class="calendar-action-btn primary" title="Buscar no mapa">
          <span class="qd-icon material-symbols-rounded">search</span>
        </button>
        <button type="button" id="btn-get-gps" class="icon-btn gps-action-btn" title="Capturar minha localização GPS atual">
          <span class="qd-icon material-symbols-rounded">my_location</span>
        </button>
      </div>

      <!-- Atalhos de locais comuns -->
      <div class="location-presets-row">
        <button type="button" class="preset-btn loc-preset" data-label="Casa">🏠 Casa</button>
        <button type="button" class="preset-btn loc-preset" data-label="Trabalho">💼 Trabalho</button>
        <button type="button" class="preset-btn loc-preset" data-label="Supermercado">🛒 Mercado</button>
        <button type="button" class="preset-btn loc-preset" data-label="Farmácia">💊 Farmácia</button>
      </div>

      <!-- Resultados da busca -->
      <div id="location-search-results" class="location-search-results" hidden></div>

      <!-- Detalhes do local selecionado -->
      <div class="location-fields-section">
        <div class="reminder-field">
          <label for="location-name-input" class="reminder-field-label">Nome do local</label>
          <input type="text" id="location-name-input" class="property-input" placeholder="Ex: Casa, Trabalho, Mercado..." value="${currentName}">
        </div>

        <div class="reminder-field">
          <div class="radius-label-row">
            <label for="location-radius-range" class="reminder-field-label">Raio de proximidade para alerta</label>
            <span id="radius-val-badge" class="radius-badge">${currentRadius}m</span>
          </div>
          <input type="range" id="location-radius-range" min="50" max="1000" step="25" value="${currentRadius}" class="graph-range">
        </div>
      </div>

      <!-- Configuração de Alarme Insistente TDAH ao Chegar -->
      <div class="location-tdah-section">
        <div class="reminder-toggle-row">
          <div class="tdah-label-group">
            <span class="qd-icon material-symbols-rounded" style="color: var(--accent);">alarm_on</span>
            <span class="reminder-toggle-label">Alarme Insistente TDAH ao chegar</span>
          </div>
          <label class="graph-switch">
            <input type="checkbox" id="location-tdah-toggle" ${loc.persistentTdah !== false ? 'checked' : ''}>
            <span class="graph-switch-slider"></span>
          </label>
        </div>

        <div class="reminder-field" id="location-tdah-interval-field">
          <label for="location-interval-select" class="reminder-field-label">Repetir alarme insistente a cada</label>
          <select id="location-interval-select" class="property-select">
            <option value="3" ${loc.intervalMinutes === 3 ? 'selected' : ''}>A cada 3 minutos</option>
            <option value="5" ${(loc.intervalMinutes || 5) === 5 ? 'selected' : ''}>A cada 5 minutos (Recomendado)</option>
            <option value="10" ${loc.intervalMinutes === 10 ? 'selected' : ''}>A cada 10 minutos</option>
            <option value="15" ${loc.intervalMinutes === 15 ? 'selected' : ''}>A cada 15 minutos</option>
          </select>
        </div>
      </div>

      <!-- Pré-visualização do Mapa -->
      <div id="location-map-container" class="location-map-container">
        ${currentLat && currentLng ? `
          <iframe class="location-map-frame" src="${gerarIframeUrl(currentLat, currentLng)}" loading="lazy"></iframe>
        ` : `
          <div class="location-map-placeholder">
            <span class="qd-icon material-symbols-rounded">map</span>
            <span>Busque um endereço ou clique em GPS para exibir o mapa</span>
          </div>
        `}
      </div>

      <!-- Links e Ações -->
      <div class="location-footer-row">
        <a id="link-google-maps" class="location-gmaps-link" ${currentLat && currentLng ? `href="https://www.google.com/maps/search/?api=1&query=${currentLat},${currentLng}" target="_blank"` : 'style="display:none;"'}>
          <span class="qd-icon material-symbols-rounded">open_in_new</span> Abrir no Google Maps
        </a>
        <div class="location-actions-right">
          ${loc.name || loc.lat ? `
            <button type="button" id="btn-remove-location" class="preset-btn test-btn remove" title="Remover local da nota">
              Remover
            </button>
          ` : ''}
          <button type="button" id="btn-save-location" class="calendar-action-btn primary">
            Salvar
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(pop);
  positionPopover(pop, anchorEl);
  activeLocationPopover = pop;

  const searchInput = pop.querySelector('#location-search-input');
  const searchBtn = pop.querySelector('#btn-search-address');
  const resultsDiv = pop.querySelector('#location-search-results');
  const nameInput = pop.querySelector('#location-name-input');
  const radiusRange = pop.querySelector('#location-radius-range');
  const radiusBadge = pop.querySelector('#radius-val-badge');
  const mapContainer = pop.querySelector('#location-map-container');
  const gmapsLink = pop.querySelector('#link-google-maps');
  const tdahToggle = pop.querySelector('#location-tdah-toggle');
  const intervalSelect = pop.querySelector('#location-interval-select');

  // Atalhos rápidos
  pop.querySelectorAll('.loc-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const label = btn.dataset.label;
      nameInput.value = label;
      searchInput.value = label;
      searchInput.focus();
    });
  });

  radiusRange.addEventListener('input', () => {
    currentRadius = Number(radiusRange.value);
    radiusBadge.textContent = `${currentRadius}m`;
  });

  const atualizarMapa = (lat, lng, nome) => {
    currentLat = lat;
    currentLng = lng;
    if (nome && !nameInput.value) {
      nameInput.value = nome;
      currentName = nome;
    }
    mapContainer.innerHTML = `<iframe class="location-map-frame" src="${gerarIframeUrl(lat, lng)}" loading="lazy"></iframe>`;
    gmapsLink.href = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    gmapsLink.style.display = 'inline-flex';
  };

  // Busca de Endereço via Nominatim (OpenStreetMap)
  const executarBusca = async () => {
    const q = searchInput.value.trim();
    if (!q) return;
    resultsDiv.hidden = false;
    resultsDiv.innerHTML = '<div class="location-search-loading">Buscando no mapa...</div>';

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&addressdetails=1`;
      const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
      const itens = await resp.json();

      if (!itens || itens.length === 0) {
        resultsDiv.innerHTML = '<div class="location-search-empty">Nenhum local encontrado. Tente com outro termo.</div>';
        return;
      }

      resultsDiv.innerHTML = '';
      itens.forEach(item => {
        const itemBtn = document.createElement('button');
        itemBtn.type = 'button';
        itemBtn.className = 'location-result-item';
        const display = item.display_name || item.name;
        itemBtn.innerHTML = `
          <span class="qd-icon material-symbols-rounded">pin_drop</span>
          <div class="result-text">
            <span class="result-name">${item.name || display.split(',')[0]}</span>
            <span class="result-desc">${display}</span>
          </div>
        `;
        itemBtn.addEventListener('click', () => {
          resultsDiv.hidden = true;
          const lat = parseFloat(item.lat);
          const lng = parseFloat(item.lon);
          const nomeCurto = item.name || display.split(',')[0];
          nameInput.value = nomeCurto;
          atualizarMapa(lat, lng, nomeCurto);
        });
        resultsDiv.appendChild(itemBtn);
      });
    } catch (err) {
      resultsDiv.innerHTML = '<div class="location-search-empty">Erro ao buscar local. Verifique sua conexão.</div>';
    }
  };

  searchBtn.addEventListener('click', executarBusca);
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      executarBusca();
    }
  });

  // GPS Atual
  pop.querySelector('#btn-get-gps')?.addEventListener('click', () => {
    if (!navigator.geolocation) {
      alert('Geolocalização não é suportada pelo seu navegador.');
      return;
    }
    const gpsBtn = pop.querySelector('#btn-get-gps');
    gpsBtn.disabled = true;
    navigator.geolocation.getCurrentPosition(
      pos => {
        gpsBtn.disabled = false;
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        atualizarMapa(lat, lng, nameInput.value || 'Minha Posição');
      },
      err => {
        gpsBtn.disabled = false;
        alert('Não foi possível obter sua posição GPS: ' + err.message);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  });

  pop.querySelector('.location-close-btn')?.addEventListener('click', closeLocationPopover);

  // Remover
  pop.querySelector('#btn-remove-location')?.addEventListener('click', async () => {
    delete props.location;
    delete props.localizacao;
    note.properties = { ...props };
    await updateNoteMetaById(note.id, { properties: note.properties });
    desregistrarGeocerca(note.id);
    document.dispatchEvent(new CustomEvent('quickdock:note-properties-updated', {
      detail: { noteId: note.id, properties: note.properties }
    }));
    closeLocationPopover();
    onSaved?.(null);
  });

  // Salvar
  pop.querySelector('#btn-save-location')?.addEventListener('click', async () => {
    const nome = nameInput.value.trim() || 'Local';
    const persistentTdah = tdahToggle ? tdahToggle.checked : true;
    const intervalMinutes = intervalSelect ? (Number(intervalSelect.value) || 5) : 5;

    const novaLocation = {
      name: nome,
      lat: currentLat,
      lng: currentLng,
      radius: currentRadius,
      persistentTdah,
      intervalMinutes
    };

    props.location = novaLocation;
    note.properties = { ...props };
    await updateNoteMetaById(note.id, { properties: note.properties });

    if (currentLat && currentLng) {
      registrarGeocerca({
        id: note.id,
        noteId: note.id,
        name: nome,
        lat: currentLat,
        lng: currentLng,
        radius: currentRadius,
        notifyOnEnter: true,
        notifyOnExit: false,
        persistentTdah,
        intervalMinutes
      });
    }

    document.dispatchEvent(new CustomEvent('quickdock:note-properties-updated', {
      detail: { noteId: note.id, properties: note.properties }
    }));

    closeLocationPopover();
    onSaved?.(novaLocation);
  });
}
