/** Declarative, explicitly opted-in interactions to reach a website's intended visual state.
 * These are executed inside a real browser tab by the CLI, never in the pure layout engine.
 * Click/fill are intentionally allowed only when written in the user's contract.
 */
export type LayoutAction =
  /** Programmatic DOM click: does not prove the target is physically hittable. */
  | { type: 'click'; selector: string }
  /** Real Chrome pointer events after a viewport hit-test; intentionally opt-in. */
  | { type: 'pointer-click'; selector: string }
  | { type: 'fill'; selector: string; value: string }
  | { type: 'wait-for'; selector: string }
  | { type: 'scroll-into-view'; selector: string }
  | { type: 'pause'; milliseconds: number };

/** Parse declared state setup; never execute user-supplied JavaScript. */
export function parseLayoutActions(value: unknown): LayoutAction[] {
  if (!Array.isArray(value) || value.length > 30)
    throw new Error('Invalid layout contract: actions must be an array of at most 30 steps');
  for (const [i, action] of value.entries()) {
    if (!action || typeof action !== 'object' || Array.isArray(action))
      throw new Error(`Invalid layout contract: actions[${i}] must be an object`);
    if (!['click', 'pointer-click', 'fill', 'wait-for', 'scroll-into-view', 'pause'].includes(action.type))
      throw new Error(`Invalid layout contract: actions[${i}] has unsupported type`);
    const fields = action.type === 'pause' ? ['type', 'milliseconds']
      : action.type === 'fill' ? ['type', 'selector', 'value'] : ['type', 'selector'];
    for (const key of Object.keys(action)) {
      if (!fields.includes(key)) throw new Error(`Invalid layout contract: actions[${i}] has unknown field ${key}`);
    }
    if (action.type === 'pause') {
      if (!Number.isInteger(action.milliseconds) || action.milliseconds < 0 || action.milliseconds > 5000)
        throw new Error(`Invalid layout contract: actions[${i}].milliseconds must be 0..5000`);
    } else if (typeof action.selector !== 'string' || !action.selector.trim() || action.selector.length > 2000)
      throw new Error(`Invalid layout contract: actions[${i}].selector must be a CSS selector`);
    if (action.type === 'fill' && (typeof action.value !== 'string' || action.value.length > 10000))
      throw new Error(`Invalid layout contract: actions[${i}].value must be a string up to 10000 characters`);
  }
  return value as LayoutAction[];
}
