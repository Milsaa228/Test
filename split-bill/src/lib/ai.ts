/**
 * Клиент бесплатных AI-моделей через OpenAI-совместимый API (по умолчанию OpenRouter).
 * Ключ OpenRouter бесплатный: openrouter.ai → Sign in → Keys → Create key.
 * Бесплатные модели (`:free`) ограничены ~20 запросами в минуту и ~50 в день на аккаунт.
 *
 * Модель «auto» выбирается из каталога OpenRouter: только бесплатные и, если нужно, понимающие фото.
 * Если модель перегружена или ответила мусором, пробуем следующую.
 */
export const OPENROUTER_URL = 'https://openrouter.ai/api/v1';
export const AUTO_MODEL = 'auto';
const MAX_ATTEMPTS = 3;

export interface AiConfig {
  apiKey: string;
  /** Базовый URL OpenAI-совместимого API. */
  baseUrl: string;
  /** ID модели или «auto» (только для OpenRouter). */
  model: string;
}

export const DEFAULT_AI: AiConfig = { apiKey: '', baseUrl: OPENROUTER_URL, model: AUTO_MODEL };

export type Part = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export class AiError extends Error {
  constructor(message: string, public retryable = false) {
    super(message);
  }
}

export function imagePart(jpegBase64: string): Part {
  return { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${jpegBase64}` } };
}

export interface CatalogModel {
  id: string;
  context_length?: number;
  pricing?: { prompt?: string | number; completion?: string | number };
  architecture?: { input_modalities?: string[] };
}

/** Бесплатные модели из каталога, лучшие первыми: сначала встроенный роутер openrouter/free, потом по размеру контекста. */
export function pickFreeModels(catalog: CatalogModel[], needsVision: boolean): string[] {
  return catalog
    .filter((m) => Number(m.pricing?.prompt) === 0 && Number(m.pricing?.completion) === 0)
    .filter((m) => m.id === 'openrouter/free' || m.id.endsWith(':free'))
    .filter((m) => !needsVision || (m.architecture?.input_modalities ?? []).includes('image'))
    .sort((a, b) => Number(b.id === 'openrouter/free') - Number(a.id === 'openrouter/free') || (b.context_length ?? 0) - (a.context_length ?? 0))
    .map((m) => m.id);
}

let catalogCache: CatalogModel[] | null = null;

async function candidateModels(cfg: AiConfig, needsVision: boolean): Promise<string[]> {
  if (cfg.model.trim() && cfg.model.trim() !== AUTO_MODEL) return [cfg.model.trim()];
  if (!cfg.baseUrl.includes('openrouter.ai')) throw new AiError('Для этого API укажите модель вручную в настройках');
  try {
    if (!catalogCache) {
      const res = await fetch(`${OPENROUTER_URL}/models`);
      if (res.ok) catalogCache = ((await res.json()) as { data?: CatalogModel[] }).data ?? [];
    }
  } catch {
    // Каталог недоступен — ниже просто попробуем роутер бесплатных моделей.
  }
  const picked = pickFreeModels(catalogCache ?? [], needsVision);
  return picked.length ? picked.slice(0, MAX_ATTEMPTS) : ['openrouter/free'];
}

/** Достаёт JSON из ответа модели: бесплатные модели любят оборачивать его в ```json или добавлять пояснения. */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1].trim() : cleaned;
  try {
    return JSON.parse(body);
  } catch {
    // Берём от первой открывающей скобки до парной ей закрывающей.
    const start = body.search(/[[{]/);
    if (start < 0) throw new AiError('Модель не вернула JSON', true);
    const open = body[start];
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    for (let i = start; i < body.length; i++) {
      const ch = body[i];
      if (inString) {
        if (ch === '\\') i++;
        else if (ch === '"') inString = false;
      } else if (ch === '"') inString = true;
      else if (ch === open) depth++;
      else if (ch === close && --depth === 0) {
        try {
          return JSON.parse(body.slice(start, i + 1));
        } catch {
          break;
        }
      }
    }
    throw new AiError('Не удалось разобрать ответ модели', true);
  }
}

async function complete(cfg: AiConfig, model: string, messages: unknown[]): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey.trim()}`,
        'Content-Type': 'application/json',
        'X-Title': 'Test apps',
      },
      body: JSON.stringify({ model, messages, temperature: 0.2 }),
    });
  } catch {
    throw new AiError('Нет соединения с сервером модели', true);
  }
  const data = (await res.json().catch(() => null)) as {
    error?: { message?: string };
    choices?: { message?: { content?: string | null } }[];
  } | null;
  if (res.status === 401) throw new AiError('Неверный API-ключ');
  if (res.status === 402) throw new AiError('На аккаунте отрицательный баланс — бесплатные модели недоступны');
  if (!res.ok || data?.error) {
    const message = data?.error?.message ?? `HTTP ${res.status}`;
    const retryable = res.status === 429 || res.status >= 500 || res.status === 404 || res.status === 400;
    throw new AiError(res.status === 429 ? 'Лимит бесплатных запросов исчерпан, попробуйте позже' : `Ошибка модели: ${message}`, retryable);
  }
  const content = data?.choices?.[0]?.message?.content?.trim();
  if (!content) throw new AiError('Модель вернула пустой ответ', true);
  return content;
}

/** Перебирает модели-кандидаты, пока одна не ответит; `parse` может отбраковать ответ и перейти к следующей. */
async function withFallback<T>(cfg: AiConfig, needsVision: boolean, messages: unknown[], parse: (text: string) => T): Promise<T> {
  if (!cfg.apiKey.trim()) throw new AiError('Добавьте API-ключ в настройках');
  let lastError: unknown;
  for (const model of await candidateModels(cfg, needsVision)) {
    try {
      return parse(await complete(cfg, model, messages));
    } catch (e) {
      lastError = e;
      if (!(e instanceof AiError) || !e.retryable) throw e;
    }
  }
  throw lastError instanceof Error ? lastError : new AiError('Модели не ответили');
}

/**
 * Запрос «картинка/текст → JSON». Структуру ответа описываем в промпте примером:
 * бесплатные модели не всегда поддерживают response_format, а пример понимают все.
 */
export async function askJson<T>(cfg: AiConfig, opts: { system: string; content: Part[]; example: unknown }): Promise<T> {
  const system = `${opts.system}\n\nОтветь ТОЛЬКО валидным JSON без пояснений и без markdown, строго в таком формате:\n${JSON.stringify(opts.example)}`;
  const needsVision = opts.content.some((p) => p.type === 'image_url');
  return withFallback(cfg, needsVision, [{ role: 'system', content: system }, { role: 'user', content: opts.content }], (text) => extractJson(text) as T);
}

/** Обычный чат: история сообщений → текстовый ответ. */
export async function askText(cfg: AiConfig, opts: { system: string; messages: ChatMessage[] }): Promise<string> {
  return withFallback(cfg, false, [{ role: 'system', content: opts.system }, ...opts.messages], (text) =>
    text.replace(/<think>[\s\S]*?<\/think>/g, '').trim(),
  );
}
