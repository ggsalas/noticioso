export function formatLastRefresh(iso?: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);

  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
