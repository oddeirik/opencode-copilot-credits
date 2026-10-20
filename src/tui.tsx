/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui"
import { Show } from "solid-js"
import { format, formatDate, quotaText, type Display } from "./format.ts"
import type { CreditSnapshot } from "./quota.ts"
import { CopilotCredits, type QuotaState, type SessionTotals, type UsageEvent } from "./rpc.ts"

export type Label = "text" | "icon"
export type { Display }

export interface PluginOptions {
  /** Footer turns yellow at or below this percentage remaining. */
  readonly warnPercent: number
  /** Footer turns red at or below this percentage remaining. */
  readonly criticalPercent: number
  /** "text" shows "Copilot"; "icon" shows the Copilot Nerd Font glyph. */
  readonly label: Label
  /** "used" shows "used/total credits used"; "remaining" shows "remaining credits left". */
  readonly display: Display
}

/** nf-oct-copilot. Requires a Nerd Font (v3+) in the terminal. */
const COPILOT_ICON = "\uF4B8"
const PROVIDER_ID = "github-copilot"

function readOptions(raw: Readonly<Record<string, unknown>>): PluginOptions {
  const number = (key: string, fallback: number) =>
    typeof raw[key] === "number" && Number.isFinite(raw[key]) ? (raw[key] as number) : fallback
  return {
    warnPercent: number("warnPercent", 25),
    criticalPercent: number("criticalPercent", 10),
    label: raw.label === "icon" ? "icon" : "text",
    display: raw.display === "remaining" ? "remaining" : "used",
  }
}

const labelText = (label: Label) => (label === "icon" ? COPILOT_ICON : "Copilot")

/**
 * Creates the plugin with options. Use this from a discovered plugin's tui.ts,
 * where cli.json options aren't available. Explicit options win over cli.json.
 * All data comes from the server plugin; this part only displays it.
 */
export function configure(overrides: Partial<PluginOptions> = {}) {
  return Plugin.define({
    id: "copilot-credits",
    setup(context) {
      const options = readOptions({ ...context.options, ...overrides })
      const theme = context.theme
      const label = labelText(options.label)

      const [live, setLive] = context.storage.memory<{
        snapshot?: CreditSnapshot
        error?: string
        /** Credits per root session, reported by the server part of the plugin. */
        sessions: Record<string, SessionTotals>
      }>("live", { initial: { sessions: {} } })

      const rpc = context.client.rpc(CopilotCredits)
      const root = (sessionID: string) => context.data.session.root(sessionID)

      const setQuota = (state: QuotaState) =>
        setLive((draft) => {
          draft.snapshot = state.snapshot
          draft.error = state.error
        })

      const loadQuota = (refresh = false) =>
        rpc
          .quota({ refresh })
          .then((state) => setQuota(state as QuotaState))
          .catch((error) =>
            setLive((draft) => {
              draft.error = error instanceof Error ? error.message : String(error)
            }),
          )

      const setTotals = (rootID: string, totals: SessionTotals) =>
        setLive((draft) => {
          // A slow initial load can arrive after a newer usage event; keep whichever has seen more requests.
          const current = draft.sessions[rootID]
          if (current && current.requests > totals.requests) return
          draft.sessions[rootID] = { credits: totals.credits, requests: totals.requests }
        })

      const loading = new Set<string>()
      const loadSession = (sessionID: string) => {
        const rootID = root(sessionID)
        if (live.sessions[rootID] || loading.has(rootID)) return
        loading.add(rootID)
        rpc
          .session({ sessionID: rootID })
          .then((totals) => setTotals(rootID, totals as SessionTotals))
          .catch(() => {})
          .finally(() => loading.delete(rootID))
      }

      const unsubscribe = [
        rpc.events.on("usage", (event) => {
          const usage = event.data as unknown as UsageEvent
          setTotals(usage.rootID, usage.total)
        }),
        rpc.events.on("quota", (event) => setQuota(event.data as unknown as QuotaState)),
      ]

      const isCopilot = () => context.ui.model.current()?.providerID === PROVIDER_ID

      // Nothing is requested from the server until a Copilot model is selected.
      let started = false
      const ensureQuota = () => {
        if (started) return
        started = true
        void loadQuota()
      }

      const color = (snapshot: CreditSnapshot) =>
        snapshot.unlimited || snapshot.percentRemaining > options.warnPercent
          ? theme.text.muted
          : snapshot.percentRemaining > options.criticalPercent
            ? theme.text.feedback.warning.base
            : theme.text.feedback.error.base

      const footerText = (snapshot: CreditSnapshot) => `${label}: ${quotaText(snapshot, options.display)}`

      const removeFooter = context.ui.slot({
        append: "prompt.footer.status",
        render: () => (
          <Show when={isCopilot() && (ensureQuota(), true)}>
            <Show
              when={live.snapshot}
              fallback={
                <Show when={live.error}>
                  <text fg={theme.text.muted}>{`${label}: n/a`}</text>
                </Show>
              }
            >
              {(snapshot) => <text fg={color(snapshot())}>{footerText(snapshot())}</text>}
            </Show>
          </Show>
        ),
      })

      const removeSidebar = context.ui.slot({
        append: "sidebar.content",
        render: (input) => {
          const entry = () => {
            loadSession(input.sessionID)
            return live.sessions[root(input.sessionID)]
          }
          return (
            <Show when={isCopilot()}>
              <box flexDirection="column">
                <text fg={theme.text.base}>
                  <b>{`${label} credits`}</b>
                </text>
                <text fg={theme.text.muted}>{`${format(entry()?.credits ?? 0, 2)} used this session`}</text>
                <Show when={live.snapshot}>
                  {(snapshot) => (
                    <text fg={color(snapshot())}>
                      {`${quotaText(snapshot(), options.display)} · resets ${formatDate(snapshot().resetDate)}`}
                    </text>
                  )}
                </Show>
              </box>
            </Show>
          )
        },
      })

      const showDetails = async () => {
        await loadQuota(true)
        const snapshot = live.snapshot
        const route = context.ui.router.current()
        const current = route.type === "session" ? live.sessions[root(route.sessionID)] : undefined
        const lines = snapshot
          ? [
              `Plan: ${snapshot.plan ?? "unknown"}`,
              `Used: ${format(snapshot.used, 2)} of ${format(snapshot.entitlement, 0)} credits`,
              `Remaining: ${format(snapshot.remaining, 2)} (${format(snapshot.percentRemaining)}%)`,
              `Resets: ${formatDate(snapshot.resetDate)}`,
              `Overage: ${snapshot.overagePermitted ? `permitted (${snapshot.overageCount} used)` : "not permitted"}`,
            ]
          : [`Unavailable: ${live.error ?? "not loaded yet"}`]
        if (current) {
          lines.push("", `This session: ${format(current.credits, 2)} credits over ${current.requests} request(s)`)
        }
        await context.ui.dialog.alert({ title: "GitHub Copilot credits", message: lines.join("\n") })
      }

      context.keymap.layer(() => ({
        mode: "global",
        enabled: isCopilot,
        commands: [
          {
            id: "copilot-credits.show",
            title: "Show Copilot credits",
            group: "Copilot",
            palette: true,
            slash: { name: "copilot-credits" },
            run: showDetails,
          },
          {
            id: "copilot-credits.refresh",
            title: "Refresh Copilot credits",
            group: "Copilot",
            palette: true,
            run: async () => {
              await loadQuota(true)
              context.ui.toast.show({
                message: live.error ? `Copilot credits: ${live.error}` : "Copilot credits refreshed",
                variant: live.error ? "error" : "success",
              })
            },
          },
        ],
      }))

      return () => {
        for (const stop of unsubscribe) stop()
        removeFooter()
        removeSidebar()
      }
    },
  })
}

export default configure()
