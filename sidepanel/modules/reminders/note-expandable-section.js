// ── note-expandable-section.js ──────────────────────────────────────────
// Seção expansível em linha (inline section) para mobile e desktop.
// Substitui popups flutuantes por uma seção integrada, responsiva e contínua.

import { updateNoteMetaById } from '../storage.js';
import { registrarGeocerca, desregistrarGeocerca } from './geo-watcher.js';
import { buscarLocaisPorTexto, obterEnderecoPorCoordenadas } from './location-service.js';
import { createMapPicker } from './map-picker.js';

let activeSectionType = null; // 'location' | 'reminder' | null
let currentMapPicker = null;

export function getSectionContainer() {
  let el = document.getElementById('note-expandable-section');
  if (!el) {
    el = document.createElement('div');
    el.id = 'note-expandable-section';
    el.className = 'note-expandable-section';
    el.hidden = true;
    const badgesEl = document.getElementById('note-header-badges');
    const propsBar = document.getElementById('note-properties-bar');
    if (badgesEl && badgesEl.parentNode) {
      badgesEl.parentNode.insertBefore(el, badgesEl.nextSibling);
    } else if (propsBar && propsBar.parentNode) {
      propsBar.parentNode.insertBefore(el, propsBar);
    } else {
      document.body.appendChild(el);
    }
  }
  return el;
}

export function closeNoteSection() {
  if (currentMapPicker) {
    currentMapPicker.destroy();
    currentMapPicker = null;
  }
  const el = getSectionContainer();
  el.hidden = true;
  el.innerHTML = '';
  el.classList.remove('is-open', 'section-location', 'section-reminder');
  activeSectionType = null;
  document.getElementById('btn-note-header-reminder')?.classList.remove('section-active');
  document.getElementById('btn-note-header-location')?.classList.remove('section-active');
}

export function isNoteSectionOpen() {
  return activeSectionType !== null;
}

export function toggleNoteSection(type, note, onSaved) {
  if (activeSectionType === type) {
    closeNoteSection();
    return;
  }
  openNoteSection(type, note, onSaved);
}

export function openNoteSection(type, note, onSaved) {
  if (!note) return;
  closeNoteSection();

  const container = getSectionContainer();
  container.hidden = false;
  container.classList.add('is-open', `section-${type}`);
  activeSectionType = type;

  if (type === 'location') {
    renderLocationSection(container, note, onSaved);
    document.getElementById('btn-note-header-location')?.classList.add('section-active');
  } else if (type === 'reminder') {
    renderReminderSection(container, note, onSaved);
    document.getElementById('btn-note-header-reminder')?.classList.add('section-active');
  }

  // Rola suavemente até a seção se estiver fora do campo de visão
  container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderLocationSection(container, note, onSaved) {
  const props = { ...(note.properties || {}) };
  const loc = (props.location && typeof props.location === 'object')
    ? props.location
    : { name: '', lat: null, lng: null, radius: 150 };

  let currentLat = loc.lat ?? null;
  let currentLng = loc.lng ?? null;
  let currentRadius = loc.radius || 150;

  container.innerHTML = `
    <div class="expandable-section-header">
      <div class="expandable-section-title">
        <span class="qd-icon material-symbols-rounded">location_on</span>
        <span>Localização & Mapa Interativo</span>
      </div>
      <button type="button" class="icon-btn btn-collapse-section" title="Recolher seção">
        <span class="qd-icon material-symbols-rounded">expand_less</span>
      </button>
    </div>

    <div class="expandable-section-body">
      <!-- Barra de busca e GPS -->
      <div class="location-search-row">
        <input type="text" id="sec-location-search" class="property-input" placeholder="Buscar endereço, rua, comércio ou bairro...">
        <button type="button" id="sec-btn-search" class="calendar-action-btn primary" title="Buscar no mapa">
          <span class="qd-icon material-symbols-rounded">search</span>
        </button>
        <button type="button" id="sec-btn-gps" class="icon-btn gps-action-btn" title="Usar minha posição GPS atual">
          <span class="qd-icon material-symbols-rounded">my_location</span>
        </button>
      </div>

      <!-- Atalhos de locais -->
      <div class="location-presets-row">
        <button type="button" class="preset-btn sec-preset" data-label="Casa">🏠 Casa</button>
        <button type="button" class="preset-btn sec-preset" data-label="Trabalho">💼 Trabalho</button>
        <button type="button" class="preset-btn sec-preset" data-label="Supermercado">🛒 Mercado</button>
        <button type="button" class="preset-btn sec-preset" data-label="Farmácia">💊 Farmácia</button>
      </div>

      <!-- Resultados da busca -->
      <div id="sec-search-results" class="location-search-results" hidden></div>

      <!-- Container do Mapa Interativo -->
      <div class="location-map-container">
        <div id="sec-map-picker" class="location-map-frame interactive-map"></div>
      </div>

      <div class="location-hint-banner">
        <span class="qd-icon material-symbols-rounded">touch_app</span>
        <span>Clique no mapa ou arraste o alfinete 📍 para posicionar o local exato.</span>
      </div>

      <!-- Campos de nome e raio -->
      <div class="location-fields-grid">
        <div class="reminder-field">
          <label for="sec-location-name" class="reminder-field-label">Nome do local</label>
          <input type="text" id="sec-location-name" class="property-input" placeholder="Ex: Minha Casa, Escritório..." value="${loc.name || ''}">
        </div>

        <div class="reminder-field">
          <div class="radius-label-row">
            <label for="sec-radius-range" class="reminder-field-label">Raio de proximidade (geocerca)</label>
            <span id="sec-radius-badge" class="radius-badge">${currentRadius}m</span>
          </div>
          <input type="range" id="sec-radius-range" min="50" max="1000" step="25" value="${currentRadius}" class="graph-range">
        </div>
      </div>

      <!-- Alarme Insistente TDAH ao Chegar -->
      <div class="location-tdah-section">
        <div class="reminder-toggle-row">
          <div class="tdah-label-group">
            <span class="qd-icon material-symbols-rounded" style="color: var(--accent);">alarm_on</span>
            <span class="reminder-toggle-label">Alarme Insistente TDAH ao chegar</span>
          </div>
          <label class="graph-switch">
            <input type="checkbox" id="sec-tdah-toggle" ${loc.persistentTdah !== false ? 'checked' : ''}>
            <span class="graph-switch-slider"></span>
          </label>
        </div>

        <div class="reminder-field">
          <label for="sec-interval-select" class="reminder-field-label">Repetir insistência a cada</label>
          <select id="sec-interval-select" class="property-select">
            <option value="3" ${loc.intervalMinutes === 3 ? 'selected' : ''}>A cada 3 minutos</option>
            <option value="5" ${(loc.intervalMinutes || 5) === 5 ? 'selected' : ''}>A cada 5 minutos (Recomendado)</option>
            <option value="10" ${loc.intervalMinutes === 10 ? 'selected' : ''}>A cada 10 minutos</option>
            <option value="15" ${loc.intervalMinutes === 15 ? 'selected' : ''}>A cada 15 minutos</option>
          </select>
        </div>
      </div>

      <!-- Rodapé de ações -->
      <div class="expandable-section-footer">
        <a id="sec-link-gmaps" class="location-gmaps-link" ${currentLat && currentLng ? `href="https://www.google.com/maps/search/?api=1&query=${currentLat},${currentLng}" target="_blank"` : 'style="display:none;"'}>
          <span class="qd-icon material-symbols-rounded">open_in_new</span> Abrir no Google Maps
        </a>
        <div class="section-actions-right">
          ${loc.name || loc.lat ? `
            <button type="button" id="sec-btn-remove" class="preset-btn test-btn remove">Remover</button>
          ` : ''}
          <button type="button" class="preset-btn btn-collapse-section">Recolher</button>
          <button type="button" id="sec-btn-save" class="calendar-action-btn primary">Salvar Local</button>
        </div>
      </div>
    </div>
  `;

  const mapEl = container.querySelector('#sec-map-picker');
  const searchInput = container.querySelector('#sec-location-search');
  const searchBtn = container.querySelector('#sec-btn-search');
  const resultsDiv = container.querySelector('#sec-search-results');
  const nameInput = container.querySelector('#sec-location-name');
  const radiusRange = container.querySelector('#sec-radius-range');
  const radiusBadge = container.querySelector('#sec-radius-badge');
  const gmapsLink = container.querySelector('#sec-link-gmaps');
  const tdahToggle = container.querySelector('#sec-tdah-toggle');
  const intervalSelect = container.querySelector('#sec-interval-select');

  const atualizarGmaps = (lat, lng) => {
    if (lat && lng) {
      gmapsLink.href = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
      gmapsLink.style.display = 'inline-flex';
    } else {
      gmapsLink.style.display = 'none';
    }
  };

  currentMapPicker = createMapPicker(mapEl, {
    lat: currentLat,
    lng: currentLng,
    radius: currentRadius,
    onLocationSelect: async (lat, lng) => {
      currentLat = lat;
      currentLng = lng;
      atualizarGmaps(lat, lng);
      try {
        const info = await obterEnderecoPorCoordenadas(lat, lng);
        if (info && (!nameInput.value.trim() || nameInput.value.startsWith('Local marcado'))) {
          nameInput.value = info.name;
        }
      } catch (_) {}
    }
  });

  radiusRange.addEventListener('input', () => {
    currentRadius = Number(radiusRange.value);
    radiusBadge.textContent = `${currentRadius}m`;
    currentMapPicker?.updateRadius(currentRadius);
  });

  container.querySelectorAll('.sec-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      nameInput.value = btn.dataset.label;
      searchInput.value = btn.dataset.label;
      searchInput.focus();
    });
  });

  const executarBusca = async () => {
    const q = searchInput.value.trim();
    if (!q) return;
    resultsDiv.hidden = false;
    resultsDiv.innerHTML = '<div class="location-search-loading">Buscando no mapa...</div>';
    try {
      const itens = await buscarLocaisPorTexto(q);
      if (!itens.length) {
        resultsDiv.innerHTML = '<div class="location-search-empty">Nenhum local encontrado.</div>';
        return;
      }
      resultsDiv.innerHTML = '';
      itens.forEach(item => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'location-result-item';
        b.innerHTML = `
          <span class="qd-icon material-symbols-rounded">pin_drop</span>
          <div class="result-text"><span class="result-name">${item.name}</span><span class="result-desc">${item.displayName}</span></div>
        `;
        b.addEventListener('click', () => {
          resultsDiv.hidden = true;
          currentLat = item.lat;
          currentLng = item.lng;
          nameInput.value = item.name;
          currentMapPicker?.panToLocation(item.lat, item.lng, 16);
          atualizarGmaps(item.lat, item.lng);
        });
        resultsDiv.appendChild(b);
      });
    } catch (_) {
      resultsDiv.innerHTML = '<div class="location-search-empty">Erro ao buscar local.</div>';
    }
  };

  searchBtn.addEventListener('click', executarBusca);
  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); executarBusca(); } });

  container.querySelector('#sec-btn-gps')?.addEventListener('click', () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async pos => {
      currentLat = pos.coords.latitude;
      currentLng = pos.coords.longitude;
      currentMapPicker?.panToLocation(currentLat, currentLng, 16);
      atualizarGmaps(currentLat, currentLng);
      try {
        const info = await obterEnderecoPorCoordenadas(currentLat, currentLng);
        if (info && !nameInput.value.trim()) nameInput.value = info.name;
      } catch (_) {}
    });
  });

  container.querySelectorAll('.btn-collapse-section').forEach(b => b.addEventListener('click', closeNoteSection));

  container.querySelector('#sec-btn-remove')?.addEventListener('click', async () => {
    delete props.location;
    delete props.localizacao;
    note.properties = { ...props };
    await updateNoteMetaById(note.id, { properties: note.properties });
    desregistrarGeocerca(note.id);
    document.dispatchEvent(new CustomEvent('quickdock:note-properties-updated', {
      detail: { noteId: note.id, properties: note.properties }
    }));
    closeNoteSection();
    onSaved?.(null);
  });

  container.querySelector('#sec-btn-save')?.addEventListener('click', async () => {
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
    closeNoteSection();
    onSaved?.(novaLocation);
  });
}

function renderReminderSection(container, note, onSaved) {
  const props = { ...(note.properties || {}) };
  const rem = (props.reminder && typeof props.reminder === 'object')
    ? props.reminder
    : { active: false, datetime: '', intervalMinutes: 5, persistent: true, completed: false };

  let currentDatetime = rem.datetime || '';

  container.innerHTML = `
    <div class="expandable-section-header">
      <div class="expandable-section-title">
        <span class="qd-icon material-symbols-rounded">alarm</span>
        <span>Lembrete TDAH (Alarme Persistente)</span>
      </div>
      <button type="button" class="icon-btn btn-collapse-section" title="Recolher seção">
        <span class="qd-icon material-symbols-rounded">expand_less</span>
      </button>
    </div>

    <div class="expandable-section-body">
      <div class="reminder-info-box">
        <span class="qd-icon material-symbols-rounded">info</span>
        <span>O alarme insistente repete a cada poucos minutos com som e notificação até você marcar a tarefa como <b>Concluir</b>.</span>
      </div>

      <div class="reminder-toggle-row">
        <span class="reminder-toggle-label">Ativar Lembrete TDAH</span>
        <label class="graph-switch">
          <input type="checkbox" id="sec-rem-active-toggle" ${rem.active ? 'checked' : ''}>
          <span class="graph-switch-slider"></span>
        </label>
      </div>

      <div class="location-fields-grid">
        <div class="reminder-field">
          <label for="sec-rem-datetime-input" class="reminder-field-label">Data e Hora do primeiro disparo</label>
          <input type="datetime-local" id="sec-rem-datetime-input" class="property-input" value="${currentDatetime}">
        </div>

        <div class="reminder-field">
          <label for="sec-rem-interval-select" class="reminder-field-label">Repetição insistente TDAH</label>
          <select id="sec-rem-interval-select" class="property-select">
            <option value="3" ${rem.intervalMinutes === 3 ? 'selected' : ''}>A cada 3 minutos (Mais insistente)</option>
            <option value="5" ${(rem.intervalMinutes || 5) === 5 ? 'selected' : ''}>A cada 5 minutos (Recomendado)</option>
            <option value="10" ${rem.intervalMinutes === 10 ? 'selected' : ''}>A cada 10 minutos</option>
            <option value="15" ${rem.intervalMinutes === 15 ? 'selected' : ''}>A cada 15 minutos</option>
            <option value="30" ${rem.intervalMinutes === 30 ? 'selected' : ''}>A cada 30 minutos</option>
          </select>
        </div>
      </div>

      <!-- Atalhos de data/hora -->
      <div class="reminder-quick-row">
        <button type="button" class="preset-btn sec-quick-btn" data-minutes="10">+10 min</button>
        <button type="button" class="preset-btn sec-quick-btn" data-minutes="30">+30 min</button>
        <button type="button" class="preset-btn sec-quick-btn" data-minutes="60">+1 hora</button>
        <button type="button" class="preset-btn sec-quick-btn" data-preset="tomorrow-9">Amanhã 09:00</button>
      </div>

      <!-- Testar alarme -->
      <div class="reminder-field" style="margin-top: 4px;">
        <button type="button" id="sec-btn-test-alarm" class="preset-btn test-btn" style="width: 100%;">
          <span class="qd-icon material-symbols-rounded">notifications_active</span>
          Testar Som & Notificação do Alarme Agora
        </button>
      </div>

      <!-- Rodapé de ações -->
      <div class="expandable-section-footer">
        <div></div>
        <div class="section-actions-right">
          ${rem.datetime || rem.active ? `
            <button type="button" id="sec-btn-rem-remove" class="preset-btn test-btn remove">Remover</button>
          ` : ''}
          <button type="button" class="preset-btn btn-collapse-section">Recolher</button>
          <button type="button" id="sec-btn-rem-save" class="calendar-action-btn primary">Salvar Lembrete</button>
        </div>
      </div>
    </div>
  `;

  const activeToggle = container.querySelector('#sec-rem-active-toggle');
  const datetimeInput = container.querySelector('#sec-rem-datetime-input');
  const intervalSelect = container.querySelector('#sec-rem-interval-select');

  container.querySelectorAll('.sec-quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeToggle.checked = true;
      const now = new Date();
      if (btn.dataset.minutes) {
        now.setMinutes(now.getMinutes() + Number(btn.dataset.minutes));
      } else if (btn.dataset.preset === 'tomorrow-9') {
        now.setDate(now.getDate() + 1);
        now.setHours(9, 0, 0, 0);
      }
      const pad = n => String(n).padStart(2, '0');
      const val = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
      datetimeInput.value = val;
    });
  });

  container.querySelector('#sec-btn-test-alarm')?.addEventListener('click', () => {
    chrome.runtime?.sendMessage?.({
      type: 'TRIGGER_TEST_NOTIFICATION',
      title: '⏰ Teste de Alarme TDAH',
      message: note.title ? `Nota: "${note.title}"` : 'QuickDock: Lembrete insistente funcionando!'
    });
  });

  container.querySelectorAll('.btn-collapse-section').forEach(b => b.addEventListener('click', closeNoteSection));

  container.querySelector('#sec-btn-rem-remove')?.addEventListener('click', async () => {
    delete props.reminder;
    delete props.lembrete;
    note.properties = { ...props };
    await updateNoteMetaById(note.id, { properties: note.properties });
    chrome.runtime?.sendMessage?.({ type: 'CANCEL_TDAH_REMINDER', noteId: note.id });
    document.dispatchEvent(new CustomEvent('quickdock:note-properties-updated', {
      detail: { noteId: note.id, properties: note.properties }
    }));
    closeNoteSection();
    onSaved?.(null);
  });

  container.querySelector('#sec-btn-rem-save')?.addEventListener('click', async () => {
    const isActive = activeToggle.checked;
    const dt = datetimeInput.value;
    const intervalMinutes = Number(intervalSelect.value) || 5;

    const novoReminder = {
      active: isActive,
      datetime: dt,
      intervalMinutes,
      persistent: true,
      completed: false
    };

    props.reminder = novoReminder;
    note.properties = { ...props };
    await updateNoteMetaById(note.id, { properties: note.properties });

    if (isActive && dt) {
      chrome.runtime?.sendMessage?.({
        type: 'SCHEDULE_TDAH_REMINDER',
        noteId: note.id,
        title: note.title || 'Sem título',
        datetime: dt,
        intervalMinutes
      });
    } else {
      chrome.runtime?.sendMessage?.({ type: 'CANCEL_TDAH_REMINDER', noteId: note.id });
    }

    document.dispatchEvent(new CustomEvent('quickdock:note-properties-updated', {
      detail: { noteId: note.id, properties: note.properties }
    }));
    closeNoteSection();
    onSaved?.(novoReminder);
  });
}
