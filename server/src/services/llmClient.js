import { config } from '../lib/config.js';

/**
 * Failure of one LLM call. `kind` is one of: unavailable, timeout, network,
 * http, invalid_body, empty. `status` is the HTTP status for kind http, else
 * null. The message never contains the key, the URL or any prompt text.
 */
export class LlmError extends Error {
  constructor(kind, message, { status = null } = {}) {
    super(message);
    this.name = 'LlmError';
    this.kind = kind;
    this.status = status;
  }
}

/**
 * The only module that talks to the LLM provider: an OpenAI-compatible
 * chat-completions endpoint (Gemini's compatibility endpoint works) over
 * built-in fetch. Swapping the provider means changing only this file.
 *
 * Never logs. Never called when the AI is unavailable or in demo mode.
 *
 * @returns {Promise<string>} the text of choices[0].message.content
 */
export async function complete({
  system,
  user,
  temperature,
  maxTokens,
  timeoutMs,
}) {
  if (config.aiStatus !== 'available') {
    throw new LlmError('unavailable', 'LLM is not configured');
  }

  const limit = Math.max(1, Math.floor(Number(timeoutMs)) || 1);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), limit);
  try {
    const response = await fetch(config.llmApiUrl, {
      method: 'POST',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.llmApiKey}`,
      },
      body: JSON.stringify({
        model: config.llmModel,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new LlmError(
        'http',
        `LLM responded with status ${response.status}`,
        { status: response.status },
      );
    }
    let data;
    try {
      data = await response.json();
    } catch (err) {
      if (controller.signal.aborted) throw err;
      throw new LlmError('invalid_body', 'LLM response body is not JSON');
    }
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim() === '') {
      throw new LlmError('empty', 'LLM returned no content');
    }
    return content;
  } catch (err) {
    if (err instanceof LlmError) throw err;
    if (controller.signal.aborted) {
      throw new LlmError('timeout', `LLM call timed out after ${limit} ms`);
    }
    // Only the error code is kept: a fetch cause can contain the host.
    throw new LlmError(
      'network',
      `LLM request failed${err?.cause?.code ? ` (${err.cause.code})` : ''}`,
    );
  } finally {
    clearTimeout(timer);
  }
}
