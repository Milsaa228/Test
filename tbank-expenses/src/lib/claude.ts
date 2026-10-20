import Anthropic from '@anthropic-ai/sdk';

/**
 * Минимальный клиент Claude API: запросы «картинка/текст → JSON по схеме» и текстовый чат.
 * Ключ пользователь вводит сам в настройках; он хранится только на устройстве.
 */
export const MODEL = 'claude-opus-5-5';

export class ClaudeError extends Error {}

type Content = Anthropic.Beta.BetaContentBlockParam;

export function imageBlock(base64: string, mediaType: 'image/jpeg' | 'image/png' = 'image/jpeg'): Content {
  return { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };
}

export async function askJson<T>(apiKey: string, opts: {
  system: string;
  content: Content[];
  schema: Record<string, unknown>;
  effort?: 'low' | 'medium' | 'high';
}): Promise<T> {
  // Ключ принадлежит самому пользователю и лежит на его устройстве, поэтому прямые запросы из клиента допустимы.
  const client = new Anthropic({ apiKey: apiKey.trim(), dangerouslyAllowBrowser: true });
  let res: Anthropic.Beta.BetaMessage;
  try {
    res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // Если модель отклонит запрос, сервер сам повторит его на запасной модели.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: opts.system,
      output_config: { effort: opts.effort ?? 'medium', format: { type: 'json_schema', schema: opts.schema } },
      messages: [{ role: 'user', content: opts.content }],
    });
  } catch (e) {
    throw new ClaudeError(describeError(e));
  }
  if (res.stop_reason === 'refusal') throw new ClaudeError('Claude отказался обрабатывать этот запрос');
  if (res.stop_reason === 'max_tokens') throw new ClaudeError('Ответ получился слишком длинным, попробуйте ещё раз');
  const text = res.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text');
  if (!text) throw new ClaudeError('Пустой ответ от Claude');
  try {
    return JSON.parse(text.text) as T;
  } catch {
    throw new ClaudeError('Не удалось разобрать ответ Claude');
  }
}

export type ChatMessage = Anthropic.Beta.BetaMessageParam;

/**
 * Многоходовой текстовый ответ (без структурированного вывода, без стриминга — в RN fetch его нет).
 * Большой и стабильный контекст передаётся в `system`: блок помечен cache_control, поэтому
 * последующие вопросы в том же разговоре читают его из кэша промптов.
 */
export async function askText(apiKey: string, opts: {
  system: string;
  messages: ChatMessage[];
  effort?: 'low' | 'medium' | 'high';
}): Promise<string> {
  const client = new Anthropic({ apiKey: apiKey.trim(), dangerouslyAllowBrowser: true });
  let res: Anthropic.Beta.BetaMessage;
  try {
    res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }],
      output_config: { effort: opts.effort ?? 'medium' },
      messages: opts.messages,
    });
  } catch (e) {
    throw new ClaudeError(describeError(e));
  }
  if (res.stop_reason === 'refusal') throw new ClaudeError('Claude отказался отвечать на этот вопрос');
  if (res.stop_reason === 'max_tokens') throw new ClaudeError('Ответ получился слишком длинным, попробуйте сузить вопрос');
  const text = res.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  if (!text) throw new ClaudeError('Пустой ответ от Claude');
  return text;
}

function describeError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return 'Неверный API-ключ Claude';
  if (e instanceof Anthropic.PermissionDeniedError) return 'У ключа нет доступа к модели';
  if (e instanceof Anthropic.RateLimitError) return 'Слишком много запросов, попробуйте через минуту';
  if (e instanceof Anthropic.BadRequestError) return `Некорректный запрос: ${e.message}`;
  if (e instanceof Anthropic.APIConnectionError) return 'Нет соединения с api.anthropic.com';
  if (e instanceof Anthropic.APIError) return `Ошибка Claude API ${e.status ?? ''}: ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}
