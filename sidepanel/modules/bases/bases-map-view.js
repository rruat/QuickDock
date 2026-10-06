// ── bases-map-view.js ───────────────────────────────────────────────────────
// View "Mapa": um pino por nota com a propriedade de localização preenchida (Leaflet, que já
// está no vendor/ e é usado pelo seletor de local dos lembretes). Pinos próximos viram um
// círculo com a contagem (cluster por grade — map/map-model.js, sem plugin).
// Os tiles precisam de rede: offline aparece um aviso e o mapa segue útil (pinos e lista).

import { getNotePropertyValue } from './bases-engine.js';
import { resolveMapConfig, buildMapPoints, boundsOf, clusterPoints, pickDefaultLocationProp } from './map/map-model.js';
import { ensureLeafletLoaded } from '../reminders/map-picker.js';

const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

export async function renderBaseMapView(container, notes, schema, viewConfig = {}, callbacks = {}) {
  container._mapCleanup?.();
  container.className = 'base-view-container base-map-container';
  container.replaceChildren();
  const token = (container._mapToken = (container._mapToken || 0) + 1);

  const cfg = resolveMapConfig(viewConfig);
  if (!cfg.location) cfg.location = pickDefaultLocationProp(schema);
  const { points, noLocation } = buildMapPoints(notes, cfg, getNotePropertyValue);

  const barra = el('div', 'bmap-toolbar');
  barra.appendChild(el('span', '', `${points.length} ${points.length === 1 ? 'local' : 'locais'}`));
  const ajustar = el('button', 'bset-btn', 'Ajustar ao conteúdo'); ajustar.type = 'button';
  barra.appendChild(ajustar);
  container.appendChild(barra);

  if (!cfg.location) {
    const v = el('div', 'bch-empty');
    v.appendChild(el('p', '', 'Escolha a propriedade de localização desta view.'));
    const b = el('button', 'bset-btn', 'Configurar view'); b.type = 'button';
    b.addEventListener('click', () => callbacks.onOpenSettings?.());
    v.appendChild(b); container.appendChild(v);
    return;
  }

  const mapaEl = el('div', 'bmap-map');
  mapaEl.style.minHeight = `${cfg.height}px`;
  container.appendChild(mapaEl);

  if (noLocation.length) {
    const d = el('details', 'bmap-nolocation');
    d.appendChild(el('summary', '', `Sem localização (${noLocation.length})`));
    const ul = el('ul');
    for (const n of noLocation) {
      const li = el('li'); const a = el('a', '', n.title || 'Sem título'); a.href = '#';
      a.addEventListener('click', e => { e.preventDefault(); callbacks.onOpenNote?.(n.id); });
      li.appendChild(a); ul.appendChild(li);
    }
    d.appendChild(ul); container.appendChild(d);
  }

  const L = await ensureLeafletLoaded();
  if (token !== container._mapToken) return;           // outra renderização já assumiu o contêiner
  if (!L) { container.insertBefore(el('div', 'bmap-offline', 'Não foi possível carregar o mapa. A lista de notas continua disponível.'), mapaEl); return; }

  const mapa = L.map(mapaEl, { attributionControl: false, zoomControl: true }).setView([-14.2, -51.9], 4);
  container._mapCleanup = () => { try { mapa.remove(); } catch { /* já removido */ } container._mapCleanup = null; };
  let erros = 0;
  const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(mapa);
  tiles.on('tileerror', () => {
    if (++erros === 3 && !container.querySelector('.bmap-offline')) container.insertBefore(el('div', 'bmap-offline', 'Sem conexão: o mapa de fundo não carregou, mas os pinos continuam no lugar.'), mapaEl);
  });

  // cor por propriedade: cada valor distinto → um matiz da paleta (bch-s0…7)
  const classesPorValor = new Map();
  const classeDe = p => {
    if (!cfg.colorBy) return 'bch-s5';
    const v = String(getNotePropertyValue(p.note, cfg.colorBy) ?? '');
    if (!classesPorValor.has(v)) classesPorValor.set(v, `bch-s${classesPorValor.size % 8}`);
    return classesPorValor.get(v);
  };

  const camada = L.layerGroup().addTo(mapa);
  const popup = p => {
    const box = el('div');
    box.appendChild(el('div', 'bmap-popup-title', p.title));
    const b = el('button', 'bmap-popup-btn', 'Abrir nota'); b.type = 'button';
    b.addEventListener('click', () => callbacks.onOpenNote?.(p.id));
    box.appendChild(b);
    return box;
  };
  const desenha = () => {
    camada.clearLayers();
    const grupos = cfg.cluster ? clusterPoints(points, mapa.getZoom()) : points.map(p => ({ lat: p.lat, lng: p.lng, points: [p], key: p.id }));
    for (const g of grupos) {
      if (g.points.length === 1) {
        const p = g.points[0];
        const icon = L.divIcon({ className: '', html: `<div class="bmap-pin ${classeDe(p)}"></div>`, iconSize: [16, 16], iconAnchor: [8, 8] });
        L.marker([p.lat, p.lng], { icon, title: p.title, keyboard: true }).bindPopup(popup(p)).addTo(camada);
      } else {
        const icon = L.divIcon({ className: '', html: `<div class="bmap-cluster">${g.points.length}</div>`, iconSize: [34, 34], iconAnchor: [17, 17] });
        L.marker([g.lat, g.lng], { icon, title: `${g.points.length} notas`, keyboard: true })
          .on('click', () => { const b = boundsOf(g.points); mapa.fitBounds([[b.south, b.west], [b.north, b.east]], { padding: [40, 40], maxZoom: 17 }); })
          .addTo(camada);
      }
    }
  };
  const enquadra = () => {
    const b = boundsOf(points);
    if (!b) return;
    if (points.length === 1) mapa.setView([b.south, b.west], 14);
    else mapa.fitBounds([[b.south, b.west], [b.north, b.east]], { padding: [40, 40] });
  };
  ajustar.addEventListener('click', enquadra);
  mapa.on('zoomend', desenha);
  if (cfg.fit) enquadra();
  desenha();
  requestAnimationFrame(() => mapa.invalidateSize());   // o contêiner pode ter sido medido antes de aparecer
}
