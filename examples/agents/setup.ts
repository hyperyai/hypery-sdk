// Shared by the examples: the model (Hypery when HYPERY_TOKEN is set, otherwise a scripted offline model so the
// examples run anywhere, CI included) and a tiny "document" with tools to read and edit it.
//
//   HYPERY_TOKEN=… HYPERY_MODEL=anthropic/claude-sonnet-4.5 bun examples/agents/basic.ts
//   bun examples/agents/basic.ts            # offline

import { createHyperyModel, type CallModel, type LoopTool, type ModelTurn, type ToolCall, type ToolRun } from '../../src/agents'

export const online = !!process.env.HYPERY_TOKEN

/** A note-taking "document": the thing the agents read and change. */
export const doc = new Map<string, string>([['title', 'Untitled'], ['body', '']])

export const docTools: LoopTool[] = [
  { readOnly: true, spec: { type: 'function', function: { name: 'read_doc', description: 'Read the document (all fields).', parameters: { type: 'object', properties: {} } } } },
  {
    readOnly: false,
    spec: {
      type: 'function',
      function: {
        name: 'set_field', description: 'Set one field of the document.',
        parameters: { type: 'object', properties: { field: { type: 'string' }, value: { type: 'string' } }, required: ['field', 'value'] },
      },
    },
  },
]

export async function runDocTool(call: ToolCall): Promise<ToolRun> {
  if (call.name === 'read_doc') return { ...call, ok: true, summary: 'read', content: JSON.stringify(Object.fromEntries(doc)) }
  if (call.name === 'set_field') {
    const { field, value } = JSON.parse(call.argsText || '{}') as { field: string; value: string }
    doc.set(field, value)
    return { ...call, ok: true, summary: `${field} set`, content: JSON.stringify({ ok: true }) }
  }
  return { ...call, ok: false, summary: 'unknown tool', content: JSON.stringify({ error: `No tool ${call.name}` }) }
}

let n = 0
const call = (name: string, args: object = {}) => ({ id: `call_${++n}`, name, arguments: JSON.stringify(args) })

/**
 * Offline stand-in for a model: reads, then acts on what the latest user message asks, then answers. Good enough to
 * show the flow; with HYPERY_TOKEN set the real model does the thinking.
 */
export function offlineModel(): CallModel {
  return async messages => {
    const system = String(messages[0]?.content ?? '')
    const last = messages[messages.length - 1]
    // The request (the first user message): later ones are notes such as "you were interrupted".
    const task = String(messages.find(m => m.role === 'user')?.content ?? '')
    const toolsRun = messages.filter(m => m.role === 'tool').map(m => m.name)
    const reply = (t: ModelTurn) => t
    if (system.startsWith('You are a reviewer')) return reply({ text: doc.get('body')?.includes('pop') ? 'PASS' : 'FAIL\n1. The body must mention "pop".', toolCalls: [] })
    if (system.startsWith('You are an explorer') || system.startsWith('You are a planner')) {
      return toolsRun.includes('read_doc') ? reply({ text: `The document: ${JSON.stringify(Object.fromEntries(doc))}`, toolCalls: [] }) : reply({ text: '', toolCalls: [call('read_doc')] })
    }
    // One edit per request, unless it asks for a title and a body.
    if (last.role === 'tool' && last.name === 'set_field' && !(/body/i.test(task) && /title/i.test(task) && !doc.get('body'))) return reply({ text: `Done: ${JSON.stringify(Object.fromEntries(doc))}`, toolCalls: [] })
    if (!toolsRun.includes('read_doc')) return reply({ text: '', toolCalls: [call('read_doc')] })
    if (/body/i.test(task) && /title/i.test(task) && doc.get('body') && doc.get('title') !== 'Untitled') return reply({ text: `Done: ${JSON.stringify(Object.fromEntries(doc))}`, toolCalls: [] })
    const title = /title[^"]*"([^"]+)"/i.exec(task)?.[1]
    if (title && doc.get('title') !== title) return reply({ text: '', toolCalls: [call('set_field', { field: 'title', value: title })] })
    return reply({ text: '', toolCalls: [call('set_field', { field: 'body', value: 'Make things that pop.' })] })
  }
}

export const model: CallModel = online
  ? createHyperyModel({ token: process.env.HYPERY_TOKEN!, model: process.env.HYPERY_MODEL ?? 'anthropic/claude-sonnet-4.5', team: process.env.HYPERY_TEAM })
  : offlineModel()

export const log = (...a: unknown[]) => console.log(...a)
