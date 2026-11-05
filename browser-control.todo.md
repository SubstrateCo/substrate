# Browser Control

- [ ] Investigate `screenshotWithLabels({ page })` timeout in Browser Control v0.8.4.
  - Session: `messaging-visual-qa`; page: `http://localhost:3000/dashboard`.
  - Reproduction: authenticate with an independent test account, create a workspace, read the dashboard snapshot, then call `screenshotWithLabels({ page })`.
  - Error: `page.screenshot: Timeout 30000ms exceeded` after `fonts loaded`.
  - Expected: labeled dashboard image. Actual: screenshot call times out.
  - Recovery: a short execute with URL and snapshot succeeds on the same page. No reset or shared session changes attempted.
  - Follow-up: plain `page.screenshot({ animations: "disabled", timeout: 12000 })` also times out after `fonts loaded` on the messaging dashboard with a channel and thread open. No image was captured. Doctor reports matching CLI/relay v0.8.4 and compatible extension v0.0.25, with readable targets. Stop screenshot retries; use fresh semantic reads and geometry for remaining checks.
