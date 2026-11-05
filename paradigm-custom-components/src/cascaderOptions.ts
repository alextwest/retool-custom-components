export type CascaderOption = { value: string; label: string; parent: string | null; disabled: boolean };

export function normalizeOptions(input: readonly unknown[]): CascaderOption[] {
  const seen = new Set<string>();
  return input.flatMap(raw => {
    if (!raw || typeof raw !== "object") return [];
    const row = raw as Record<string, unknown>;
    if (typeof row.value !== "string" || !row.value || seen.has(row.value)) return [];
    seen.add(row.value);
    return [{ value: row.value, label: String(row.label ?? row.value), parent: row.parent == null || row.parent === "" ? null : String(row.parent), disabled: row.disabled === true }];
  });
}

export function optionPath(option: CascaderOption, options: CascaderOption[]): CascaderOption[] {
  const path = [option];
  const visited = new Set([option.value]);
  let parent = option.parent;
  while (parent !== null && !visited.has(parent)) {
    visited.add(parent);
    const next = options.find(row => row.value === parent);
    if (!next) break;
    path.unshift(next);
    parent = next.parent;
  }
  return path;
}
