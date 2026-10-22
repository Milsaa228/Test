// Сервис-воркер: управляет offscreen-документом (где живёт MediaRecorder)
// и сохраняет готовые записи через chrome.downloads.

const OFFSCREEN_URL = 'offscreen.html';

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (contexts.length > 0) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['USER_MEDIA'],
    justification: 'Запись звука вкладки через MediaRecorder',
  });
}

async function getState() {
  const { recording } = await chrome.storage.session.get('recording');
  return recording || null;
}

function sanitizeFilename(name) {
  return (name || 'recording')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'recording';
}

async function startRecording({ tabId, streamId, label }) {
  if (await getState()) throw new Error('Запись уже идёт');
  await ensureOffscreen();
  const res = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'start', streamId });
  if (!res?.ok) throw new Error(res?.error || 'Не удалось начать запись');
  await chrome.storage.session.set({
    recording: { tabId, label, startedAt: Date.now() },
  });
  chrome.action.setBadgeText({ text: 'REC' });
  chrome.action.setBadgeBackgroundColor({ color: '#d93025' });
}

async function stopRecording() {
  if (!(await getState())) return;
  await chrome.runtime.sendMessage({ target: 'offscreen', type: 'stop' });
}

async function onRecordingReady({ url, extension }) {
  const state = await getState();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `TabRecorder/${sanitizeFilename(state?.label)} ${stamp}.${extension}`;
  await chrome.storage.session.remove('recording');
  chrome.action.setBadgeText({ text: '' });
  try {
    await chrome.downloads.download({ url, filename, saveAs: false });
  } finally {
    // Даём загрузке время прочитать blob, затем освобождаем его и закрываем offscreen.
    setTimeout(async () => {
      await chrome.runtime.sendMessage({ target: 'offscreen', type: 'revoke', url }).catch(() => {});
      await chrome.offscreen.closeDocument().catch(() => {});
    }, 60_000);
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.target !== 'background') return;
  const handlers = {
    start: () => startRecording(msg),
    stop: () => stopRecording(),
    state: () => getState(),
    'recording-ready': () => onRecordingReady(msg),
    'recording-error': async () => {
      await chrome.storage.session.remove('recording');
      chrome.action.setBadgeText({ text: '' });
    },
  };
  const handler = handlers[msg.type];
  if (!handler) return;
  handler()
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err) => sendResponse({ ok: false, error: err.message }));
  return true;
});

// Если записываемую вкладку закрыли — завершаем запись и сохраняем то, что успели.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const state = await getState();
  if (state?.tabId === tabId) await stopRecording();
});
