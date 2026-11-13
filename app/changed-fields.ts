/** Keep large, unchanged photos and structured fields out of update payloads. */
export function changedFields(previous: Record<string,unknown>, next: Record<string,unknown>) {
  return Object.fromEntries(Object.entries(next).filter(([key,value])=>value!==undefined && (value!==null && typeof value==="object" ? JSON.stringify(previous[key])!==JSON.stringify(value) : previous[key]!==value)));
}
