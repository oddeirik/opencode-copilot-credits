# opencode-copilot-credits

An OpenCode CLI plugin that shows GitHub Copilot credit usage:

- **Footer:** credits used this month, e.g. `Copilot: 7,112/15,000 credits used`, or the remaining credits,
  `Copilot: 7,921 credits left`. Turns yellow and then red as you run low.
- **Sidebar:** credits spent in the current session, plus remaining credits and the reset date.
- **`/copilot-credits`** (also in the command palette): full breakdown, including overage and the current session's turns.
- **Refresh Copilot credits** (command palette): fetches the latest numbers immediately.

## Install

```sh
opencode plugin add github:oddeirik/opencode-copilot-credits
opencode service restart
```

Start OpenCode; `/plugins` should list `copilot-credits`. To update, install the new tag. Pinning a tag matters:
unpinned git installs may be cached and not pick up new commits.

### Windows

If OpenCode fails to install the git spec (some Windows builds have git-backed install issues), install with bun and
point OpenCode at the installed folder instead:

```powershell
bun add github:oddeirik/opencode-copilot-credits --cwd "$HOME\.config\opencode"
```

```jsonc
{
  "plugins": [
    "C:\\Users\\<you>\\.config\\opencode\\node_modules\\opencode-copilot-credits",
  ],
}
```

OpenCode does not expand `~`, so use the full path.

## Configure

Everything is configured in one place, the plugin entry in `~/.config/opencode/opencode.json`. All options are
optional.

```jsonc
{
  "plugins": [
    {
      "package": "github:oddeirik/opencode-copilot-credits",
      "options": { "display": "remaining", "label": "icon" },
    },
  ],
}
```

Restart with `opencode service restart` after changing options.

| Option            | Default  | Description                                                                           |
| ----------------- | -------- | ------------------------------------------------------------------------------------- |
| `display`         | `"used"` | `"used"` shows `7,112/15,000 credits used`; `"remaining"` shows `7,921 credits left`. |
| `label`           | `"text"` | `"text"` shows `Copilot`; `"icon"` shows the Copilot icon instead.                    |
| `warnPercent`     | `25`     | Footer turns yellow at or below this % remaining.                                     |
| `criticalPercent` | `10`     | Footer turns red at or below this % remaining.                                        |
| `refreshMinutes`  | `5`      | How often to poll GitHub while idle.                                                  |

### Icon label

`label: "icon"` uses the Nerd Font glyph `nf-oct-copilot` (U+F4B8). It only renders if your **terminal** font is a
Nerd Font from v3.0 or later; otherwise you'll see an empty box. OpenCode draws with whatever font the terminal uses,
so set the font in the terminal (for example Windows Terminal → Settings → profile → Appearance → Font face →
"CaskaydiaCove Nerd Font"). Fonts are available from <https://www.nerdfonts.com/font-downloads>.

## Authentication

The plugin reuses the GitHub token OpenCode stores when you sign in to the **GitHub Copilot** provider, so no extra
setup is needed. The server part looks it up through OpenCode's integration API, so the token never reaches the TUI.
If that isn't available, set `COPILOT_CREDITS_TOKEN` (in the OpenCode service's environment) to a GitHub OAuth token
with Copilot access. The token is only sent to `api.github.com` and is never written to disk by the plugin.

## How the numbers work

- **Remaining / total** come from GitHub's `copilot_internal/user` endpoint (`premium_interactions` quota), the same
  data the Copilot IDE extensions show. It's **undocumented** and may change; if it does, the footer shows
  `Copilot: n/a` instead of failing. "Used" is GitHub's `credits_used`, which updates sooner than the remaining
  figure (GitHub refreshes that in batches), so used + remaining may briefly not add up to the total.
- **Per-session credits** are exact. Every Copilot response includes a `copilot_usage` block with the response's
  cost (`total_nano_aiu`, billionths of a credit), which is also what VS Code shows per interaction. The plugin's
  server part reads it from each `github-copilot` response through the `http.response` session hook, without
  changing the response, and keeps a running total per session in plugin storage. Subagent usage counts toward the
  parent session. Concurrent sessions and Copilot use elsewhere don't affect each other's totals.
  - Only responses received while the plugin is loaded are counted, so sessions from before installing it start at 0.
- An organization- or enterprise-wide budget isn't visible through this endpoint; only your own entitlement is.

## Development

```sh
git clone https://github.com/oddeirik/opencode-copilot-credits
cd opencode-copilot-credits
bun install
bun test           # parsing unit tests
bun run typecheck
bun run check      # formatting and lint (Biome)
bun run format     # apply formatting
```

To run your clone in OpenCode, create `~/.config/opencode/plugins/copilot-credits/` with two files:

```ts title="index.ts"
import { configure } from "file:///ABSOLUTE/PATH/TO/opencode-copilot-credits/src/server.ts";

export default configure({ display: "used", refreshMinutes: 5 });
```

```ts title="tui.ts"
import { configure } from "file:///ABSOLUTE/PATH/TO/opencode-copilot-credits/src/tui.tsx";

export default configure();
```

Then run `opencode service restart`.
