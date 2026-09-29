/**
 * The agent loop: Claude decides which tool to call next; this code runs the
 * tool and sends the result back, until Claude answers or a limit is hit.
 *
 * A manual loop (rather than the SDK's beta tool runner) so that:
 *  - the client is injected, and tests run the whole loop with a scripted fake;
 *  - there is a hard step limit (cost control) and a trace of every step;
 *  - refusals and truncated turns are handled before any tool runs.
 *
 * History is append-only: every response is appended as-is and never edited.
 */
'use strict';

const { SYSTEM_PROMPT } = require('./prompt');

const DEFAULT_MODEL = 'claude-opus-5-5';
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const MAX_TOOL_RESULT_CHARS = 20000;

function textOf(content) {
  return (content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
}

/**
 * options: { client, toolbox, request, model, effort, maxSteps, onStep }
 * Returns { status: 'done' | 'refused' | 'truncated' | 'step_limit', answer, steps, usage, trace }.
 */
async function runAgent(options) {
  const { client, toolbox, request } = options;
  const model = options.model || DEFAULT_MODEL;
  const maxSteps = options.maxSteps || 12;
  const messages = [{ role: 'user', content: String(request).slice(0, 4000) }];
  const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 };
  const trace = [];

  for (let step = 1; step <= maxSteps; step++) {
    const response = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      betas: [FALLBACK_BETA],
      fallbacks: 'default', // if a safety classifier declines, the API retries on its recommended model
      output_config: { effort: options.effort || 'medium' },
      cache_control: { type: 'ephemeral' },
      system: SYSTEM_PROMPT,
      tools: toolbox.definitions,
      messages
    });

    const u = response.usage || {};
    usage.input_tokens += u.input_tokens || 0;
    usage.output_tokens += u.output_tokens || 0;
    usage.cache_read_input_tokens += u.cache_read_input_tokens || 0;

    const toolUses = (response.content || []).filter((b) => b.type === 'tool_use');
    const entry = { step, stop_reason: response.stop_reason, model: response.model, tools: toolUses.map((t) => t.name) };
    trace.push(entry);
    if (options.onStep) options.onStep(entry);

    if (response.stop_reason === 'refusal') {
      return { status: 'refused', details: response.stop_details || null, answer: '', steps: step, usage, trace, messages };
    }
    if (response.stop_reason === 'max_tokens') {
      return { status: 'truncated', answer: textOf(response.content), steps: step, usage, trace, messages };
    }

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'pause_turn') continue;
    if (!toolUses.length) {
      return { status: 'done', answer: textOf(response.content), steps: step, usage, trace, messages };
    }

    // Run every requested tool, then return ALL results in a single user message.
    const results = await Promise.all(toolUses.map(async (use) => {
      try {
        const output = JSON.stringify(await toolbox.run(use.name, use.input));
        const content = output.length > MAX_TOOL_RESULT_CHARS
          ? output.slice(0, MAX_TOOL_RESULT_CHARS) + ' …[truncated: ask for fewer results]'
          : output;
        return { type: 'tool_result', tool_use_id: use.id, content };
      } catch (err) {
        return { type: 'tool_result', tool_use_id: use.id, content: `Error: ${String(err.message).slice(0, 300)}`, is_error: true };
      }
    }));
    messages.push({ role: 'user', content: results });
  }
  return { status: 'step_limit', answer: '', steps: maxSteps, usage, trace, messages };
}

module.exports = { runAgent, DEFAULT_MODEL, FALLBACK_BETA };
