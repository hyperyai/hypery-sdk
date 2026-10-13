// The plan an agent keeps while it works (Claude Code's todo list, dune's manage_todos): a short list of steps with a
// status, which the agent updates as it goes and the host shows. Saved with the run, so a resumed run keeps its plan.

import type { LoopTool } from './loop.js'
import type { ToolCall, ToolRun } from './types.js'

export type TodoStatus = 'pending' | 'in_progress' | 'done' | 'blocked'
export interface Todo { id: string; text: string; status: TodoStatus; note?: string }

export const TODO_TOOL = 'manage_todos'

export const todoTool: LoopTool = {
  readOnly: true,
  acts: false,
  spec: {
    type: 'function',
    function: {
      name: TODO_TOOL,
      description: 'Keep your plan for this request: set the whole list of steps (replace), or update steps by id. Mark one step in_progress at a time and done as soon as it is; blocked with a note when you cannot. The user sees this list.',
      parameters: {
        type: 'object',
        properties: {
          replace: { type: 'array', description: 'The whole plan, in order.', items: { type: 'object', properties: { id: { type: 'string' }, text: { type: 'string' }, status: { type: 'string', enum: ['pending', 'in_progress', 'done', 'blocked'] } }, required: ['text'] } },
          update: { type: 'array', description: 'Changes to existing steps.', items: { type: 'object', properties: { id: { type: 'string' }, status: { type: 'string', enum: ['pending', 'in_progress', 'done', 'blocked'] }, note: { type: 'string' }, text: { type: 'string' } }, required: ['id'] } },
        },
      },
    },
  },
}

/** A todo list with change notifications. */
export class TodoList {
  private items: Todo[] = []
  constructor(initial: Todo[] = [], private onChange?: (todos: Todo[]) => void) { this.items = initial.map(t => ({ ...t })) }

  get(): Todo[] { return this.items.map(t => ({ ...t })) }

  /** Steps not done yet. */
  open(): Todo[] { return this.items.filter(t => t.status !== 'done') }

  run(call: ToolCall): ToolRun {
    let args: { replace?: Partial<Todo>[]; update?: Partial<Todo>[] } = {}
    try { args = JSON.parse(call.argsText || '{}') } catch { return { ...call, ok: false, summary: 'invalid arguments', content: JSON.stringify({ error: 'Arguments are not valid JSON.' }) } }
    if (args.replace) {
      this.items = args.replace.filter(t => t.text).map((t, i) => ({ id: t.id || String(i + 1), text: String(t.text), status: (t.status as TodoStatus) || 'pending' }))
    }
    for (const u of args.update ?? []) {
      const t = this.items.find(x => x.id === u.id)
      if (!t) continue
      if (u.status) t.status = u.status as TodoStatus
      if (u.note !== undefined) t.note = u.note
      if (u.text) t.text = u.text
    }
    this.onChange?.(this.get())
    const done = this.items.filter(t => t.status === 'done').length
    return { ...call, ok: true, summary: `${done}/${this.items.length} done`, content: JSON.stringify({ todos: this.items }) }
  }
}
