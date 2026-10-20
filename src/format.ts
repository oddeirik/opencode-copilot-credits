import type { CreditSnapshot } from "./quota.ts"

export type Display = "used" | "remaining"

export const format = (value: number, digits = 1) => value.toLocaleString("en-US", { maximumFractionDigits: digits })

export const formatDate = (iso: string | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "?"

export function quotaText(snapshot: CreditSnapshot, display: Display) {
  if (snapshot.unlimited) return "unlimited credits"
  return display === "remaining"
    ? `${format(snapshot.remaining, 0)} credits left`
    : `${format(snapshot.used, 0)}/${format(snapshot.entitlement, 0)} credits used`
}
