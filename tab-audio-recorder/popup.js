const $ = (id) => document.getElementById(id);
let activeTab = null;
let timerId = null;

function send(type, extra = {}) {
  return chrome.runtime.sendMessage({ target: 'background', type, ...extra }).then((res) => {
    if (!res?.ok) throw new Error(res?.error || 'Неизвестная ошибка');
    return res.data;
  });
}

function showError(err) {
  $('error').textContent = err ? String(err.message || err) : '';
  $('error').hidden = !err;
}

// Метаданные трека: сайты с плеерами обычно заполняют Media Session API,
// иначе берём заголовок вкладки.
async function readTrackInfo(tab) {
  let meta = null;
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: () => {
        const m = navigator.mediaSession?.metadata;
        return m ? { title: m.title, artist: m.artist, album: m.album } : null;
      },
    });
    meta = result;
  } catch {
    // Служебные страницы (chrome://, магазин расширений) недоступны для скриптов.
  }
  return {
    title: meta?.title || tab.title || 'Без названия',
    artist: meta?.artist || '',
    album: meta?.album || '',
    url: tab.url,
    savedAt: new Date().toISOString(),
  };
}

function trackLabel(t) {
  return t.artist ? `${t.artist} — ${t.title}` : t.title;
}

function renderTimer(startedAt) {
  clearInterval(timerId);
  const tick = () => {
    const s = Math.floor((Date.now() - startedAt) / 1000);
    $('timer').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  tick();
  timerId = setInterval(tick, 500);
}

async function renderState() {
  const state = await send('state');
  const btn = $('record');
  if (state) {
    btn.textContent = '■ Остановить';
    btn.classList.add('active');
    btn.disabled = false;
    $('timer').hidden = false;
    renderTimer(state.startedAt);
  } else {
    btn.textContent = '● Записать';
    btn.classList.remove('active');
    $('timer').hidden = true;
    clearInterval(timerId);
  }
  return state;
}

async function renderSaved() {
  const { savedTracks = [] } = await chrome.storage.local.get('savedTracks');
  const list = $('saved');
  list.replaceChildren(
    ...savedTracks
      .slice()
      .reverse()
      .map((t) => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = t.url;
        a.target = '_blank';
        a.textContent = trackLabel(t);
        const meta = document.createElement('div');
        meta.className = 'meta';
        meta.textContent = [t.album, new Date(t.savedAt).toLocaleString()].filter(Boolean).join(' · ');
        li.append(a, meta);
        return li;
      }),
  );
  $('export').disabled = $('clear').disabled = savedTracks.length === 0;
}

$('record').addEventListener('click', async () => {
  showError(null);
  $('record').disabled = true;
  try {
    if (await send('state')) {
      await send('stop');
    } else {
      // getMediaStreamId требует жеста пользователя — поэтому вызываем его прямо из popup.
      const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: activeTab.id });
      const info = await readTrackInfo(activeTab);
      await send('start', { tabId: activeTab.id, streamId, label: trackLabel(info) });
    }
  } catch (err) {
    showError(err);
  } finally {
    $('record').disabled = false;
    // Остановка асинхронна: состояние сбросится, когда файл уйдёт в загрузки.
    setTimeout(renderState, 300);
  }
});

$('save-track').addEventListener('click', async () => {
  showError(null);
  const info = await readTrackInfo(activeTab);
  const { savedTracks = [] } = await chrome.storage.local.get('savedTracks');
  savedTracks.push(info);
  await chrome.storage.local.set({ savedTracks });
  renderSaved();
});

$('clear').addEventListener('click', async () => {
  await chrome.storage.local.set({ savedTracks: [] });
  renderSaved();
});

$('export').addEventListener('click', async () => {
  const { savedTracks = [] } = await chrome.storage.local.get('savedTracks');
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['artist', 'title', 'album', 'url', 'savedAt'], ...savedTracks.map((t) => [t.artist, t.title, t.album, t.url, t.savedAt])];
  const csv = '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  await chrome.downloads.download({ url, filename: 'TabRecorder/saved-tracks.csv', saveAs: true });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && 'recording' in changes) renderState();
});

(async () => {
  [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const info = await readTrackInfo(activeTab);
  $('track').textContent = trackLabel(info);
  await renderState();
  await renderSaved();
})();
