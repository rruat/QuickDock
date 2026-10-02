// ── sw.js ──────────────────────────────────────────────────────────────────
// Service Worker do QuickDock PWA.
//
// Projetado para operar com versionamento estrito de cache e ativação imediata:
// - Quando uma nova versão é publicada, ela assume o controle sem esperar o
//   usuário fechar abas (skipWaiting + clients.claim).
// - Estratégia Network-First para navegação e scripts: garante que arquivos de
//   código atualizados sejam obtidos da rede imediatamente quando online,
//   eliminando o risco de um SW antigo reter código desatualizado e corromper
//   formatos compartilhados com a extensão (ver HANDOFF-5.md).
// - Fallback para cache quando offline.

const CACHE_NAME = 'quickdock-v3.0.0-38';

const ASSET_PATHS = [
  '',
  'index.html',
  '404.html',
  'privacidade.html',
  'manifest.webmanifest',
  'sidepanel/style.css',
  'sidepanel/css/01-base.css',
  'sidepanel/css/02-note-section.css',
  'sidepanel/css/03-blocks.css',
  'sidepanel/css/04-media-table.css',
  'sidepanel/css/05-tabs.css',
  'sidepanel/css/06-smart-detection-templates.css',
  'sidepanel/css/07-documents.css',
  'sidepanel/css/08-toolbars-math.css',
  'sidepanel/css/09-sync-responsive.css',
  'sidepanel/css/10-mobile-sheets.css',
  'sidepanel/css/11-view-engine.css',
  'sidepanel/css/12-templates-gallery.css',
  'sidepanel/css/13-desktop-layout.css',
  'sidepanel/css/14-folders-drawer.css',
  'sidepanel/css/15-backlinks-outline.css',
  'sidepanel/css/16-graph-view.css',
  'sidepanel/css/17-note-properties.css',
  'sidepanel/css/18-calendar-view.css',
  'sidepanel/css/19-bases-view.css',
  'sidepanel/css/20-json-studio.css',
  'sidepanel/css/21-dashboard-zero-tabs.css',
  'sidepanel/css/22-spatial-shell.css',
  'sidepanel/css/23-mobile-spatial.css',
  'sidepanel/css/24-spatial-guides.css',
  'sidepanel/css/25-print.css',
  'sidepanel/css/26-note-cover.css',
  'sidepanel/css/27-note-icon-image.css',
  'sidepanel/css/28-reminders.css',
  'sidepanel/css/29-calendar-views.css',
  'vendor/leaflet/leaflet.css',
  'vendor/leaflet/leaflet.js',
  'vendor/leaflet/images/marker-icon.png',
  'vendor/leaflet/images/marker-icon-2x.png',
  'vendor/leaflet/images/marker-shadow.png',
  'lib/dexie.min.js',
  'sidepanel/app.js',
  'sidepanel/boot-platform.js',
  'sidepanel/modules/platform.js',
  'sidepanel/modules/google-config.js',
  'sidepanel/modules/google-auth.js',
  'sidepanel/modules/google-auth-web.js',
  'sidepanel/modules/google-drive-adapter.js',
  'sidepanel/modules/storage.js',
  'sidepanel/modules/notes-tabs.js',
  'sidepanel/modules/notes-tutorial.js',
  'sidepanel/modules/notes-appearance.js',
  'sidepanel/modules/notes-template-mode.js',
  'sidepanel/modules/notes-dashboard.js',
  'sidepanel/modules/note.js',
  'sidepanel/modules/note-state.js',
  'sidepanel/modules/note-dom-utils.js',
  'sidepanel/modules/note-viewport.js',
  'sidepanel/modules/note-print.js',
  'sidepanel/modules/note-cover.js',
  'sidepanel/modules/note-icon-image.js',
  'sidepanel/modules/note-text-transforms.js',
  'sidepanel/modules/note-export-helpers.js',
  'sidepanel/modules/note-header.js',
  'sidepanel/modules/note-backlinks.js',
  'sidepanel/modules/note-outline.js',
  'sidepanel/modules/note-properties.js',
  'sidepanel/modules/note-detection.js',
  'sidepanel/modules/note-link-autocomplete.js',
  'sidepanel/modules/note-mobile-toolbar.js',
  'sidepanel/modules/reminders/geo-math.js',
  'sidepanel/modules/reminders/geo-watcher.js',
  'sidepanel/modules/reminders/location-service.js',
  'sidepanel/modules/reminders/location-popover.js',
  'sidepanel/modules/reminders/map-picker.js',
  'sidepanel/modules/reminders/note-expandable-section.js',
  'sidepanel/modules/reminders/persistent-reminder.js',
  'sidepanel/modules/reminders/reminder-popover.js',
  'sidepanel/modules/reminders/reminder-types.js',
  'sidepanel/modules/reminders/reminder-ui.js',
  'sidepanel/modules/reminders/reminder-sound.js',
  'sidepanel/modules/reminders/reminder-runner.js',
  'sidepanel/modules/blocks.js',
  'sidepanel/modules/calc.js',
  'sidepanel/modules/math-parser.js',
  'sidepanel/modules/documents.js',
  'sidepanel/modules/inject.js',
  'sidepanel/modules/modal.js',
  'sidepanel/modules/selection.js',
  'sidepanel/modules/resizer.js',
  'sidepanel/modules/active-area.js',
  'sidepanel/modules/popover.js',
  'sidepanel/modules/templates.js',
  'sidepanel/modules/templates-gallery.js',
  'sidepanel/modules/views.js',
  'sidepanel/modules/icons.js',
  'sidepanel/modules/material-icons-list.js',
  'sidepanel/modules/backup.js',
  'sidepanel/modules/snapshot.js',
  'sidepanel/modules/sync-engine.js',
  'sidepanel/modules/sync-controller.js',
  'sidepanel/modules/sync-adapter.js',
  'sidepanel/modules/local-folder-adapter.js',
  'sidepanel/modules/notefile.js',
  'sidepanel/modules/property-types.js',
  'sidepanel/modules/links.js',
  'sidepanel/modules/graph-view.js',
  'sidepanel/modules/board-view.js',
  'sidepanel/modules/board-engine.js',
  'sidepanel/modules/calendar-view.js',
  'sidepanel/modules/bases-view.js',
  'sidepanel/modules/desktop-panels.js',
  'sidepanel/modules/responsive-header.js',
  'sidepanel/modules/bases/bases-schema.js',
  'sidepanel/modules/bases/bases-engine.js',
  'sidepanel/modules/bases/bases-yaml.js',
  'sidepanel/modules/bases/bases-view-container.js',
  'sidepanel/modules/bases/bases-embedded.js',
  'sidepanel/modules/bases/bases-table-view.js',
  'sidepanel/modules/bases/bases-board-view.js',
  'sidepanel/modules/bases/bases-gallery-view.js',
  'sidepanel/modules/bases/bases-list-view.js',
  'sidepanel/modules/bases/bases-calendar-view.js',
  'sidepanel/modules/bases/bases-cell-editors.js',
  'sidepanel/modules/spatial-shell.js',
  'sidepanel/modules/json-view.js',
  'sidepanel/modules/json-templates.js',
  'sidepanel/modules/json-model.js',
  'board/index.html',
  'board/style.css',
  'board/board.js',
  'icons/16.png',
  'icons/48.png',
  'icons/128.png',
  'icons/192.png',
  'icons/512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      for (const caminho of ASSET_PATHS) {
        try {
          const url = new URL(caminho, self.registration.scope).href;
          await cache.add(url);
        } catch (err) {
          console.warn('Falha no pré-carregamento do recurso:', caminho, err);
        }
      }
    })
  );
  // Não espera abas fecharem: assume controle para que atualizações entrem logo
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Network-First: tenta a rede primeiro para garantir que a versão mais nova
  // do código seja sempre servida. Em caso de falha (offline), usa o cache.
  // 'cors' entra na lista pra cachear a fonte Material Symbols do Google
  // (fonts.gstatic.com libera CORS) e ela funcionar offline após o 1º carregamento.
  event.respondWith(
    fetch(req)
      .then(response => {
        if (response && response.status === 200 && (response.type === 'basic' || response.type === 'cors')) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;

        // Se for navegação (abertura de página) e offline, devolve a casca index.html
        if (req.mode === 'navigate') {
          const indexUrl = new URL('index.html', self.registration.scope).href;
          const rootUrl = new URL('', self.registration.scope).href;
          return (await caches.match(indexUrl)) || (await caches.match(rootUrl));
        }

        return new Response('Offline e recurso não encontrado em cache.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      })
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
