import { Rpc } from "@opencode/plugin/rpc"
import type { CreditSnapshot } from "./quota.ts"

const totals = {
  type: "object",
  properties: {
    credits: { type: "number" },
    requests: { type: "number" },
  },
  required: ["credits", "requests"],
  additionalProperties: false,
} as const

const snapshot = {
  type: "object",
  properties: {
    entitlement: { type: "number" },
    remaining: { type: "number" },
    used: { type: "number" },
    percentRemaining: { type: "number" },
    unlimited: { type: "boolean" },
    overagePermitted: { type: "boolean" },
    overageCount: { type: "number" },
    resetDate: { type: "string" },
    plan: { type: "string" },
    fetchedAt: { type: "number" },
  },
  required: [
    "entitlement",
    "remaining",
    "used",
    "percentRemaining",
    "unlimited",
    "overagePermitted",
    "overageCount",
    "fetchedAt",
  ],
  additionalProperties: false,
} as const

/** Latest account quota, or the error from the last attempt to load it. */
const quotaState = {
  type: "object",
  properties: {
    snapshot,
    error: { type: "string" },
  },
  additionalProperties: false,
} as const

/** Display settings. Configured on the server part and read by the TUI part, so they can live in one place. */
export interface DisplayOptions {
  /** Footer turns yellow at or below this percentage remaining. */
  readonly warnPercent: number
  /** Footer turns red at or below this percentage remaining. */
  readonly criticalPercent: number
  /** "text" shows "Copilot"; "icon" shows the Copilot Nerd Font glyph. */
  readonly label: "text" | "icon"
  /** "used" shows "used/total credits used"; "remaining" shows "remaining credits left". */
  readonly display: "used" | "remaining"
}

const displayOptions = {
  type: "object",
  properties: {
    warnPercent: { type: "number" },
    criticalPercent: { type: "number" },
    label: { type: "string" },
    display: { type: "string" },
  },
  additionalProperties: false,
} as const

export const CopilotCredits = Rpc.define({
  id: "copilot-credits",
  methods: {
    /** Display options configured on the server part. Only the ones that were set are returned. */
    options: {
      input: { type: "object", properties: {}, additionalProperties: false },
      output: displayOptions,
    },
    /** Monthly account quota. Pass refresh to fetch it from GitHub now instead of using the cached value. */
    quota: {
      input: {
        type: "object",
        properties: { refresh: { type: "boolean" } },
        additionalProperties: false,
      },
      output: quotaState,
    },
    /** Credits used by a session, including its subagents. */
    session: {
      input: {
        type: "object",
        properties: { sessionID: { type: "string" } },
        required: ["sessionID"],
        additionalProperties: false,
      },
      output: totals,
    },
  },
  events: {
    /** The account quota was fetched again, or fetching it failed. */
    quota: { schema: quotaState },
    /** A Copilot response was billed. */
    usage: {
      schema: {
        type: "object",
        properties: {
          sessionID: { type: "string" },
          rootID: { type: "string" },
          /** Credits for this one response. */
          credits: { type: "number" },
          /** Running total for the root session. */
          total: totals,
        },
        required: ["sessionID", "rootID", "credits", "total"],
        additionalProperties: false,
      },
    },
  },
})

export interface SessionTotals {
  credits: number
  requests: number
}

export interface QuotaState {
  snapshot?: CreditSnapshot
  error?: string
}

export interface UsageEvent {
  sessionID: string
  rootID: string
  credits: number
  total: SessionTotals
}
