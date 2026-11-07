# Desktop testing

- Use the real Electron fixtures in `e2e/test-support`. Run functional workflows once at the standard desktop size (1024×768), not across a size or theme matrix.
- Tag layout cases `@layout`. Check wrapping, clipping, scrolling, reachable controls, and alternate navigation at a desktop size and a narrow, short size. Add targeted breakpoint, container-width, or zoom checks only where behavior changes.
- When layouts have separate UI paths, check each path's distinct interaction. Do not repeat the full business workflow for each layout.
- Seed unrelated prerequisites through APIs or native bridges. Keep native authentication, session isolation, permissions, and navigation real.
- Assert durable outcomes. Wait for relevant requests or realtime resync to settle; do not wait for obsolete polling or use fixed sleeps for readiness. Keep native UI workers serial because windows share OS focus.
