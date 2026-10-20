// HTML-страница карты для WebView: Leaflet + тайлы OpenStreetMap, ключ API не нужен.
// Страница строится один раз; дальше React Native шлёт ей JSON-обновления через injectJavaScript,
// а она отвечает через window.ReactNativeWebView.postMessage.
// Тексты заметок попадают на страницу только через textContent, поэтому HTML из чужих заметок не выполняется.

import type { LatLng } from './types';

export const LEAFLET_VERSION = '1.9.4';
export const LEAFLET_JS = {
  src: `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`,
  integrity: 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=',
};
export const LEAFLET_CSS = {
  href: `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`,
  integrity: 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=',
};
export const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export interface MapNote extends LatLng {
  id: string;
  emoji: string;
  text: string;
  radius: number;
}

/** Сообщения React Native → страница. */
export type MapCommand =
  | { type: 'notes'; notes: MapNote[] }
  | { type: 'position'; position: LatLng | null }
  | { type: 'picked'; picked: LatLng | null; radius: number }
  | { type: 'options'; pickerMode: boolean; canPick: boolean; canOpen: boolean }
  | { type: 'view'; center: LatLng; zoom: number | null };

/** Сообщения страница → React Native. */
export type MapEvent =
  | { type: 'ready' }
  | { type: 'pick'; point: LatLng }
  | { type: 'open'; id: string }
  | { type: 'retry' };

export interface MapColors {
  zone: string;
  zoneStroke: string;
  text: string;
  danger: string;
  muted: string;
}

export interface MapInit {
  center: LatLng;
  zoom: number;
  colors: MapColors;
}

/** JSON, который безопасно вставлять и в JS-код, и внутрь <script>. */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** Код для WebView.injectJavaScript: передать команду странице. */
export function commandScript(cmd: MapCommand): string {
  return `try{window.__geoUpdate&&window.__geoUpdate(${jsonForScript(cmd)})}catch(e){}true;`;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Разбор и проверка сообщения со страницы. Всё непонятное — null. */
export function parseMapEvent(data: string): MapEvent | null {
  let msg: unknown;
  try {
    msg = JSON.parse(data);
  } catch {
    return null;
  }
  if (!msg || typeof msg !== 'object') return null;
  const m = msg as Record<string, unknown>;
  switch (m.type) {
    case 'ready':
    case 'retry':
      return { type: m.type };
    case 'open':
      return typeof m.id === 'string' && m.id.length > 0 && m.id.length <= 200 ? { type: 'open', id: m.id } : null;
    case 'pick': {
      const p = m.point as Record<string, unknown> | null;
      if (!p || !isNum(p.latitude) || !isNum(p.longitude)) return null;
      if (Math.abs(p.latitude) > 90 || Math.abs(p.longitude) > 180) return null;
      return { type: 'pick', point: { latitude: p.latitude, longitude: p.longitude } };
    }
    default:
      return null;
  }
}

// Код страницы. Без внешних данных: всё приходит через init и __geoUpdate.
const PAGE_SCRIPT = String.raw`
(function () {
  var RN = window.ReactNativeWebView;
  function send(msg) { if (RN) RN.postMessage(JSON.stringify(msg)); }
  document.getElementById('retry').onclick = function () { send({ type: 'retry' }); };
  if (!window.L) { window.__geoFail(); return; }

  var init = window.__geoInit;
  var C = init.colors;
  var map = L.map('map', { zoomControl: false, tapHold: true, worldCopyJump: true })
    .setView([init.center.latitude, init.center.longitude], init.zoom);
  map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
  L.tileLayer(${JSON.stringify(OSM_TILES)}, { maxZoom: 19, attribution: ${JSON.stringify(OSM_ATTRIBUTION)} }).addTo(map);

  var notesLayer = L.layerGroup().addTo(map);
  var pickedLayer = L.layerGroup().addTo(map);
  var meLayer = L.layerGroup().addTo(map);
  var opts = { pickerMode: false, canPick: false, canOpen: false };
  var notes = [];
  var me = null;

  function num(v) { return typeof v === 'number' && isFinite(v); }
  function ll(p) { return p && num(p.latitude) && num(p.longitude) ? [p.latitude, p.longitude] : null; }
  function textEl(cls, text) {
    var el = document.createElement('div');
    el.className = cls;
    el.textContent = String(text == null ? '' : text);
    return el;
  }

  function drawNotes() {
    notesLayer.clearLayers();
    notes.forEach(function (n) {
      var at = ll(n);
      if (!at) return;
      if (num(n.radius) && n.radius > 0) {
        L.circle(at, { radius: n.radius, color: C.zoneStroke, weight: 1, opacity: 1, fillColor: C.zone, fillOpacity: 1, interactive: false })
          .addTo(notesLayer);
      }
      var icon = L.divIcon({ html: textEl('emoji', String(n.emoji || '').slice(0, 16)), className: 'emoji-icon', iconSize: [36, 36], iconAnchor: [18, 18] });
      var marker = L.marker(at, { icon: icon, interactive: !opts.pickerMode, keyboard: false }).addTo(notesLayer);
      if (opts.pickerMode) return;
      if (opts.canOpen) {
        var id = String(n.id);
        marker.on('click', function () { send({ type: 'open', id: id }); });
      } else {
        var box = document.createElement('div');
        box.appendChild(textEl('popup-title', (String(n.emoji || '') + ' ' + String(n.text || '')).slice(0, 300)));
        marker.bindPopup(box, { maxWidth: 260 });
      }
    });
  }

  function drawMe() {
    meLayer.clearLayers();
    var at = ll(me);
    locate.style.display = at ? '' : 'none';
    if (!at) return;
    L.circleMarker(at, { radius: 8, color: '#FFFFFF', weight: 3, fillColor: '#1A73E8', fillOpacity: 1, interactive: false }).addTo(meLayer);
  }

  function drawPicked(p, radius) {
    pickedLayer.clearLayers();
    var at = ll(p);
    if (!at) return;
    L.circle(at, { radius: num(radius) && radius > 0 ? radius : 100, color: C.text, weight: 2, fillColor: 'rgba(28, 28, 30, 0.12)', fillOpacity: 1, interactive: false })
      .addTo(pickedLayer);
    L.circleMarker(at, { radius: 9, color: '#FFFFFF', weight: 3, fillColor: C.danger, fillOpacity: 1, interactive: false }).addTo(pickedLayer);
  }

  // Кнопка «где я» (как кнопка «моё местоположение» в нативных картах).
  var locate;
  var Locate = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd: function () {
      locate = L.DomUtil.create('button', 'locate');
      locate.type = 'button';
      locate.setAttribute('aria-label', 'Где я');
      locate.textContent = '◎';
      locate.style.display = 'none';
      L.DomEvent.disableClickPropagation(locate);
      L.DomEvent.on(locate, 'click', function () {
        var at = ll(me);
        if (at) map.flyTo(at, Math.max(map.getZoom(), 16), { duration: 0.4 });
      });
      return locate;
    },
  });
  new Locate().addTo(map);

  // Долгое нажатие — выбор точки; в режиме выбора — и обычное касание.
  // Долгое нажатие может прийти и как contextmenu, и как tapHold, поэтому гасим повтор.
  var lastPick = 0;
  function pick(e) {
    if (!opts.canPick) return;
    var now = Date.now();
    if (now - lastPick < 800) return;
    lastPick = now;
    var p = e.latlng.wrap();
    send({ type: 'pick', point: { latitude: p.lat, longitude: p.lng } });
  }
  map.on('contextmenu', pick);
  map.on('click', function (e) { if (opts.pickerMode) pick(e); });

  window.__geoUpdate = function (cmd) {
    if (!cmd || typeof cmd !== 'object') return;
    switch (cmd.type) {
      case 'notes':
        notes = Array.isArray(cmd.notes) ? cmd.notes : [];
        drawNotes();
        break;
      case 'position':
        me = cmd.position;
        drawMe();
        break;
      case 'picked':
        drawPicked(cmd.picked, cmd.radius);
        break;
      case 'options':
        var changed = !!cmd.pickerMode !== opts.pickerMode || !!cmd.canOpen !== opts.canOpen;
        opts = { pickerMode: !!cmd.pickerMode, canPick: !!cmd.canPick, canOpen: !!cmd.canOpen };
        if (changed) drawNotes();
        break;
      case 'view':
        var at = ll(cmd.center);
        if (at) map.flyTo(at, num(cmd.zoom) ? cmd.zoom : map.getZoom(), { duration: 0.4 });
        break;
    }
  };

  drawMe();
  send({ type: 'ready' });
})();
`;

export function buildMapHtml(init: MapInit): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="${LEAFLET_CSS.href}" integrity="${LEAFLET_CSS.integrity}" crossorigin="">
<style>
  html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; }
  body { background: #E8E6E1; font-family: -apple-system, Roboto, sans-serif; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
  .emoji-icon { background: none; border: none; }
  .emoji { font-size: 28px; line-height: 36px; width: 36px; text-align: center; text-shadow: 0 1px 2px rgba(0,0,0,.25); }
  .popup-title { font-size: 15px; white-space: pre-wrap; overflow-wrap: anywhere; }
  .locate { width: 44px; height: 44px; border-radius: 22px; border: none; background: #fff; font-size: 24px; color: #1A73E8; box-shadow: 0 1px 4px rgba(0,0,0,.3); }
  #err { display: none; position: absolute; inset: 0; z-index: 2000; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 24px; text-align: center; color: ${init.colors.muted}; font-size: 15px; background: #F2F3F5; }
  #err button { font-size: 15px; padding: 10px 18px; border-radius: 14px; border: none; background: #fff; color: ${init.colors.text}; }
</style>
<script>
  window.__geoInit = ${jsonForScript(init)};
  window.__geoFail = function () { document.getElementById('err').style.display = 'flex'; };
</script>
</head>
<body>
<div id="map"></div>
<div id="err"><div>Не удалось загрузить карту. Проверьте подключение к интернету.</div><button id="retry" type="button">Повторить</button></div>
<script src="${LEAFLET_JS.src}" integrity="${LEAFLET_JS.integrity}" crossorigin="" onerror="window.__geoFail()"></script>
<script>${PAGE_SCRIPT}</script>
</body>
</html>`;
}
