export function formatDateTime(value?: string | Date | null) {
  if (!value) return "-";

  const d = typeof value === "string" ? new Date(value) : value;

  if (isNaN(d.getTime())) return "-";

  return d.toLocaleString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(value?: string | Date | null) {
  if (!value) return "-";

  const d = typeof value === "string" ? new Date(value) : value;

  if (isNaN(d.getTime())) return "-";

  return d.toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}