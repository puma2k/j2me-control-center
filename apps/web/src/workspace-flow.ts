export type DetailTab = "play" | "settings" | "logs";
export function workspaceTargets(
  detail: string | null,
  tab: DetailTab,
  page: string,
  selected: string[],
  layout: number,
  broadcast: boolean,
) {
  const viewing = detail
    ? tab === "play"
      ? [detail]
      : []
    : page === "screens"
      ? selected.slice(0, layout)
      : [];
  return {
    viewing,
    input: !viewing.length ? [] : broadcast ? selected : viewing.slice(0, 1),
  };
}
