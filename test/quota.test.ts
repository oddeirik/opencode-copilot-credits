import assert from "node:assert/strict"
import { test } from "node:test"
import { parseCreditSnapshot } from "../src/quota.ts"

test("uses credits_used and keeps the fractional remaining", () => {
  const parsed = parseCreditSnapshot({
    copilot_plan: "business",
    quota_reset_date_utc: "2026-11-01T00:00:00Z",
    quota_snapshots: {
      premium_interactions: {
        entitlement: 15000,
        remaining: 7921,
        quota_remaining: 7921.2,
        credits_used: 7112,
        percent_remaining: 52.8,
        unlimited: false,
        overage_permitted: true,
        overage_count: 0,
      },
    },
  })
  assert.equal(parsed.entitlement, 15000)
  assert.equal(parsed.remaining, 7921.2)
  assert.equal(parsed.used, 7112)
  assert.equal(parsed.resetDate, "2026-11-01T00:00:00Z")
})

test("falls back to entitlement minus remaining when credits_used is missing", () => {
  const parsed = parseCreditSnapshot({
    quota_snapshots: { premium_interactions: { entitlement: 15000, quota_remaining: 8212.4 } },
  })
  assert.ok(Math.abs(parsed.used - 6787.6) < 1e-9)
})

test("rejects responses without a premium quota", () => {
  assert.throws(() => parseCreditSnapshot({ quota_snapshots: {} }))
})
