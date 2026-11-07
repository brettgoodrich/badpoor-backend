export function formatQty(value: number) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(
    Math.round(value * 1000) / 1000,
  );
}

export function formatDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

export function fulfillmentLabel(status: string) {
  switch (status) {
    case "UNFULFILLED":
      return "Unfulfilled";
    case "PARTIALLY_FULFILLED":
      return "Partial";
    case "FULFILLED":
      return "Fulfilled";
    default:
      return status.replaceAll("_", " ").toLowerCase();
  }
}

/**
 * Shopify order GIDs contain slashes (`gid://shopify/Order/1042`), which cannot
 * be a single App Router segment. The numeric id is unique and safe in the URL.
 */
export function orderKey(id: string) {
  const match = /\/(\d+)$/.exec(id);
  return match?.[1] ?? encodeURIComponent(id);
}

export function orderPath(id: string) {
  return `/orders/${orderKey(id)}`;
}

export function sameOrder(storedId: string, routeKey: string) {
  return storedId === routeKey || storedId.endsWith(`/${routeKey}`);
}

export function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}
