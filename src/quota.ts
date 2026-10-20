export const QUOTA_URL = "https://api.github.com/copilot_internal/user"

export interface CreditSnapshot {
  readonly entitlement: number
  readonly remaining: number
  readonly used: number
  readonly percentRemaining: number
  readonly unlimited: boolean
  readonly overagePermitted: boolean
  readonly overageCount: number
  readonly resetDate?: string
  readonly plan?: string
  readonly fetchedAt: number
}

interface QuotaSnapshot {
  readonly entitlement?: number
  readonly remaining?: number
  readonly quota_remaining?: number
  readonly credits_used?: number
  readonly percent_remaining?: number
  readonly unlimited?: boolean
  readonly overage_permitted?: boolean
  readonly overage_count?: number
}

interface CopilotUserResponse {
  readonly copilot_plan?: string
  readonly quota_reset_date_utc?: string
  readonly quota_reset_date?: string
  readonly quota_snapshots?: Record<string, QuotaSnapshot | undefined>
}

export class QuotaError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = "QuotaError"
    this.status = status
  }
}

export function parseCreditSnapshot(body: unknown, now = Date.now()): CreditSnapshot {
  const response = body as CopilotUserResponse
  const premium = response?.quota_snapshots?.premium_interactions
  if (!premium || typeof premium.entitlement !== "number") {
    throw new QuotaError("Response has no premium_interactions quota")
  }

  const entitlement = premium.entitlement
  // quota_remaining keeps the fractional part; remaining is rounded.
  const remaining = premium.quota_remaining ?? premium.remaining ?? 0
  return {
    entitlement,
    remaining,
    // credits_used updates sooner than quota_remaining, which GitHub refreshes in batches.
    used: premium.credits_used ?? Math.max(0, entitlement - remaining),
    percentRemaining: premium.percent_remaining ?? (entitlement > 0 ? (remaining / entitlement) * 100 : 100),
    unlimited: premium.unlimited === true,
    overagePermitted: premium.overage_permitted === true,
    overageCount: premium.overage_count ?? 0,
    resetDate: response.quota_reset_date_utc ?? response.quota_reset_date,
    plan: response.copilot_plan,
    fetchedAt: now,
  }
}

export async function fetchCreditSnapshot(token: string, fetchImpl: typeof fetch = fetch): Promise<CreditSnapshot> {
  const response = await fetchImpl(QUOTA_URL, {
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/json",
      "User-Agent": "opencode-copilot-credits",
      "X-GitHub-Api-Version": "2025-04-01",
    },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) {
    throw new QuotaError(`GitHub returned ${response.status}`, response.status)
  }
  return parseCreditSnapshot(await response.json())
}
