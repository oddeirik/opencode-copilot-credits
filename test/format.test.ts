import assert from "node:assert/strict";
import { test } from "node:test";
import { quotaText } from "../src/format.ts";
import { parseCreditSnapshot } from "../src/quota.ts";

const snapshot = parseCreditSnapshot({
	quota_snapshots: {
		premium_interactions: {
			entitlement: 15000,
			remaining: 7921,
			quota_remaining: 7921.2,
			credits_used: 7112,
			unlimited: false,
		},
	},
});

test("used shows GitHub's credits_used out of the total", () => {
	assert.equal(quotaText(snapshot, "used"), "7,112/15,000 credits used");
});

test("remaining shows credits left", () => {
	assert.equal(quotaText(snapshot, "remaining"), "7,921 credits left");
});

test("unlimited quotas say so in either mode", () => {
	const unlimited = { ...snapshot, unlimited: true };
	assert.equal(quotaText(unlimited, "used"), "unlimited credits");
	assert.equal(quotaText(unlimited, "remaining"), "unlimited credits");
});
