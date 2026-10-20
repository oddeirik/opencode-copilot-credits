# opencode-copilot-credits

An OpenCode CLI plugin that shows GitHub Copilot credit usage:

- **Footer:** credits used this month, e.g. `Copilot: 7,112/15,000 credits used`, or the remaining credits,
  `Copilot: 7,921 credits left`. Turns yellow and then red as you run low.
- **Sidebar:** credits spent in the current session, plus remaining credits and the reset date.
- **`/copilot-credits`** (also in the command palette): full breakdown, including overage and the current session's turns.
- **Refresh Copilot credits** (command palette): fetches the latest numbers immediately.

## Install

Install straight from GitHub (no npm registry needed). Pin a release tag:

```sh
opencode plugin add github:oddeirik/opencode-copilot-credits#v0.1.0
opencode service restart
```

Or add it by hand to `~/.config/opencode/opencode.json`:

```jsonc
{
  "plugins": [
    {
      "package": "github:oddeirik/opencode-copilot-credits#v0.1.0",
      "options": { "refreshMinutes": 5 }
    }
  ]
}
```

Start OpenCode; `/plugins` should list `copilot-credits`. Update by changing the tag and restarting. Unpinned git
specs may be cached and not pick up new commits.

The server part does all the fetching; the TUI part only displays what the server reports. `refreshMinutes` goes to
the server part (`opencode.json`). The display options below go to the TUI part, which loads automatically with the
server plugin using its defaults. To change them, add a `cli.json` entry (`~/.config/opencode/cli.json`) with
`options`, for example `{ "label": "icon", "display": "remaining" }`.

### Windows

If OpenCode fails to install the git spec (some Windows builds have git-backed install issues), install with npm and
point OpenCode at the installed folder:

```powershell
npm install github:oddeirik/opencode-copilot-credits --prefix "$HOME\.config\opencode"
```

Then use the absolute path in `opencode.json`. OpenCode does not expand `~`:

```jsonc
{ "plugins": ["C:\\Users\\<you>\\.config\\opencode\\node_modules\\opencode-copilot-credits"] }
```

## Local development

```sh
git clone https://github.com/oddeirik/opencode-copilot-credits
cd opencode-copilot-credits
npm install
```

Create `~/.config/opencode/plugins/copilot-credits/` with two files, pointing at your clone:

```ts title="tui.ts"
import { configure } from "file:///ABSOLUTE/PATH/TO/opencode-copilot-credits/src/tui.tsx"

export default configure({ label: "text", display: "used" })
```

```ts title="index.ts"
// Server part: fetches the account quota and reads the per-response credit cost from Copilot responses.
import { configure } from "file:///ABSOLUTE/PATH/TO/opencode-copilot-credits/src/server.ts"

export default configure({ refreshMinutes: 5 })
```

Then run `opencode service restart`.

> A `file:///C:/…` entry in `cli.json` `plugins` did not load on Windows (OpenCode 2.1.0), which is why the plugin
> folder is used for local development.

| Option            | Part   | Default  | Description                                                                    |
| ----------------- | ------ | -------- | ------------------------------------------------------------------------------ |
| `label`           | TUI    | `"text"` | `"text"` shows `Copilot`; `"icon"` shows the Copilot icon instead.             |
| `display`         | TUI    | `"used"` | `"used"` shows `7,112/15,000 credits used`; `"remaining"` shows `7,921 credits left`. |
| `warnPercent`     | TUI    | `25`     | Footer turns yellow at or below this % remaining.                              |
| `criticalPercent` | TUI    | `10`     | Footer turns red at or below this % remaining.                                 |
| `refreshMinutes`  | Server | `5`      | How often to poll GitHub while idle.                                           |

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

## Tests

```sh
npm test           # parsing unit tests (Node 22.6+)
npm run typecheck
```
