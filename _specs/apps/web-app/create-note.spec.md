 # Create note spec

 ## Acceptancecriteria

 - Given when the user clicks the + tab left to the opened tabs on the tabbar
 - Then a new markdown draft opens as a tab
 - When the tab hasn't been saved yet it will prompt the user to choose a location inside the workspace

 ## Test plan

 E2E tests are implemented in `apps/web-app/e2e/create-note.spec.ts` using Playwright.
 Run with: `pnpm --filter web-app run e2e`

 ### Active tests

 | Test | Description |
 |------|-------------|
 | "+" button is visible in the tab bar | The "+" button renders in the tab bar when the workspace is ready |
 | clicking "+" opens a new untitled tab | Clicking "+" creates a tab titled "untitled" |
 | new tab shows the editor pane | After creating a tab the editor pane is visible and the empty-state placeholder is hidden |
 | second "+" click produces "untitled (2)" | Multiple drafts get numbered titles to avoid collisions |
 | Ctrl+S on new draft prompts for filename and saves | Pressing Ctrl+S on an unsaved draft shows a save prompt; after accepting the tab title updates to the saved filename and the dirty indicator disappears |

 ### Test setup

 All tests mock the server API (`/api/workspace`, `/api/files`, `/api/file*`) via `page.route()`
 so they run hermetically without a real filesystem. A separate Vite dev server is started on
 port 4173 (`pnpm run dev:test`) to avoid conflicts with the regular dev server.
