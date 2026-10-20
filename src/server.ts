import { Plugin } from "@opencode/plugin"
import { fetchCreditSnapshot, QuotaError } from "./quota.ts"
import { CopilotCredits, type DisplayOptions, type QuotaState, type SessionTotals } from "./rpc.ts"
import { resolveToken, TOKEN_ENV } from "./token.ts"
import { readNanoAiu, toCredits } from "./usage.ts"

const PROVIDER_ID = "github-copilot"

/** GitHub records usage a little after the response finishes, so check again shortly after a billed response. */
const LATE_USAGE_DELAYS_MS = [5_000, 20_000]

interface StoredTotals {
  nanoAiu: number
  requests: number
}

const key = (rootID: string) => `session/${rootID}`

const toTotals = (stored: StoredTotals | undefined): SessionTotals => ({
  credits: toCredits(stored?.nanoAiu ?? 0),
  requests: stored?.requests ?? 0,
})

export interface ServerOptions extends DisplayOptions {
  /** How often to poll GitHub for the account quota, in minutes. */
  readonly refreshMinutes: number
}

/**
 * Reads GitHub's per-response billing (copilot_usage.total_nano_aiu) from every
 * Copilot response and keeps a running total per root session. Also owns the
 * account quota: it holds the GitHub credential, polls GitHub, and publishes
 * the result so the TUI only has to display it.
 *
 * Use this from a discovered plugin's index.ts, where opencode.json options
 * aren't available. Explicit options win over configured ones.
 */
export function configure(overrides: Partial<ServerOptions> = {}) {
  return Plugin.define({
    id: "copilot-credits.server",
    async setup(ctx) {
      const raw = { ...ctx.options, ...overrides }
      const refreshMinutes =
        typeof raw.refreshMinutes === "number" && Number.isFinite(raw.refreshMinutes)
          ? Math.max(1, raw.refreshMinutes)
          : 5

      // Passed on to the TUI part as given; it validates them and applies defaults.
      const display: { -readonly [K in keyof DisplayOptions]?: DisplayOptions[K] } = {}
      for (const name of ["warnPercent", "criticalPercent"] as const) {
        if (typeof raw[name] === "number" && Number.isFinite(raw[name])) display[name] = raw[name]
      }
      if (raw.label === "text" || raw.label === "icon") display.label = raw.label
      if (raw.display === "used" || raw.display === "remaining") display.display = raw.display

      const roots = new Map<string, Promise<string>>()
      const rootOf = (sessionID: string): Promise<string> => {
        let root = roots.get(sessionID)
        if (!root) {
          root = ctx.session
            .get({ sessionID })
            .then((session) => (session.parentID ? rootOf(session.parentID) : sessionID))
            .catch(() => {
              roots.delete(sessionID)
              return sessionID
            })
          roots.set(sessionID, root)
        }
        return root
      }

      const read = async (rootID: string) => (await ctx.storage.get(key(rootID))) as StoredTotals | undefined

      // Updates to one root run in order so concurrent subagent responses don't overwrite each other.
      const queues = new Map<string, Promise<unknown>>()
      const add = (rootID: string, nanoAiu: number) => {
        const next = (queues.get(rootID) ?? Promise.resolve()).then(async () => {
          const current = await read(rootID)
          const updated: StoredTotals = {
            nanoAiu: (current?.nanoAiu ?? 0) + nanoAiu,
            requests: (current?.requests ?? 0) + 1,
          }
          await ctx.storage.set(key(rootID), { ...updated })
          return updated
        })
        queues.set(
          rootID,
          next.catch(() => {}),
        )
        return next
      }

      let quota: QuotaState = {}
      let token: string | undefined
      const getSnapshot = async () => {
        token ??= await resolveToken(ctx.integration)
        if (!token) {
          throw new QuotaError(`No GitHub Copilot credential found; sign in or set ${TOKEN_ENV}`)
        }
        try {
          return await fetchCreditSnapshot(token)
        } catch (error) {
          // The credential may have been replaced; look it up again next time.
          if (error instanceof QuotaError && error.status === 401) token = undefined
          throw error
        }
      }

      let refreshing: Promise<QuotaState> | undefined
      const refresh = () =>
        (refreshing ??= getSnapshot()
          .then((snapshot): QuotaState => ({ snapshot }))
          .catch((error): QuotaState => ({
            // Keep showing the last known numbers when a refresh fails.
            snapshot: quota.snapshot,
            error: error instanceof Error ? error.message : String(error),
          }))
          .then(async (next) => {
            quota = next
            await registration.events.emit("quota", { ...quota })
            return quota
          })
          .finally(() => (refreshing = undefined)))

      // Polling starts on first Copilot use (a Copilot response or a quota request from the TUI).
      let interval: ReturnType<typeof setInterval> | undefined
      const start = () => {
        if (interval) return
        interval = setInterval(() => void refresh(), refreshMinutes * 60_000)
        void refresh()
      }

      const registration = await ctx.rpc.register(CopilotCredits, {
        options: async () => ({ ...display }),
        quota: async (input) => {
          start()
          const { refresh: force } = (input ?? {}) as { refresh?: boolean }
          return force || (!quota.snapshot && !quota.error) ? await refresh() : quota
        },
        session: async (input) => {
          const { sessionID } = input as { sessionID: string }
          return toTotals(await read(await rootOf(sessionID)))
        },
      })

      const timers = new Set<ReturnType<typeof setTimeout>>()
      const later = (ms: number) => {
        const timer = setTimeout(() => {
          timers.delete(timer)
          void refresh()
        }, ms)
        timers.add(timer)
      }

      const record = async (sessionID: string, body: ReadableStream<Uint8Array>) => {
        start()
        const nanoAiu = await readNanoAiu(body)
        if (nanoAiu === undefined) return
        const rootID = await rootOf(sessionID)
        const total = await add(rootID, nanoAiu)
        await registration.events.emit("usage", {
          sessionID,
          rootID,
          credits: toCredits(nanoAiu),
          total: toTotals(total),
        })
        // GitHub's monthly totals lag behind the response; check again shortly after the latest one.
        for (const timer of timers) clearTimeout(timer)
        timers.clear()
        for (const delay of LATE_USAGE_DELAYS_MS) later(delay)
      }

      const hook = await ctx.session.hook(
        "http.response",
        (event) => {
          if (!event.response.ok || !event.response.body) return
          // Read a copy in the background; the original stream goes to OpenCode untouched.
          const copy = event.response.clone()
          if (!copy.body) return
          void record(event.sessionID, copy.body).catch((error) =>
            console.error("[copilot-credits] failed to record usage", error),
          )
        },
        { providerID: PROVIDER_ID },
      )

      return async () => {
        if (interval) clearInterval(interval)
        for (const timer of timers) clearTimeout(timer)
        await hook.dispose()
        await registration.dispose()
      }
    },
  })
}

export default configure()
