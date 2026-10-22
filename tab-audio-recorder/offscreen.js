// Offscreen-документ: получает поток вкладки, записывает его и
// одновременно проигрывает обратно, чтобы вкладка не замолкала.

let recorder = null;
let audioCtx = null;
let stream = null;
let chunks = [];

function pickMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || '';
}

async function start(streamId) {
  if (recorder) throw new Error('Запись уже идёт');
  stream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
  });

  // tabCapture глушит вкладку — пускаем звук обратно в динамики.
  audioCtx = new AudioContext();
  audioCtx.createMediaStreamSource(stream).connect(audioCtx.destination);

  const mimeType = pickMimeType();
  recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 192_000 });
  chunks = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.onstop = () => {
    const type = recorder.mimeType || 'audio/webm';
    const blob = new Blob(chunks, { type });
    const extension = type.includes('ogg') ? 'ogg' : 'webm';
    cleanup();
    chrome.runtime.sendMessage({
      target: 'background',
      type: 'recording-ready',
      url: URL.createObjectURL(blob),
      extension,
    });
  };
  // Поток может оборваться сам (вкладку закрыли/перезагрузили).
  stream.getAudioTracks()[0].onended = () => recorder?.state === 'recording' && recorder.stop();
  recorder.start(1000);
}

function cleanup() {
  stream?.getTracks().forEach((t) => t.stop());
  audioCtx?.close();
  recorder = null;
  audioCtx = null;
  stream = null;
  chunks = [];
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.target !== 'offscreen') return;
  if (msg.type === 'start') {
    start(msg.streamId)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => {
        cleanup();
        chrome.runtime.sendMessage({ target: 'background', type: 'recording-error' });
        sendResponse({ ok: false, error: err.message });
      });
    return true;
  }
  if (msg.type === 'stop') {
    if (recorder?.state === 'recording') recorder.stop();
    sendResponse({ ok: true });
  }
  if (msg.type === 'revoke') {
    URL.revokeObjectURL(msg.url);
    sendResponse({ ok: true });
  }
});
