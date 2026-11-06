# Shared UI

## Strict package boundary

- This package owns all presentation used by web, including single-use domain views. Web must import presentation from `@startup-os/ui`; it must not define its own views, markup, styles, forms, table cells, or feedback layouts.
- Keep UI presentation-only. Accept data, display states, navigation targets, and action callbacks through props. Use slots or render callbacks to compose connected content without importing application code.
- Never import web/server code, application query hooks, RPC/API clients, Better Auth clients, database/storage implementations, or Electron APIs. Never fetch domain data, mutate workspace records, manage query caches, load sessions, or decide authorization here.
- Permission props describe capabilities already resolved by the application. Hiding a control is presentation, not access enforcement. The server remains responsible for authorization.
- Local form drafts, selection, open/closed state, keyboard behavior, focus, scrolling, theme state, and image editing are presentation concerns and belong here. Application persistence and platform actions must enter through callbacks.
- Separate meaningful parts by responsibility: item/tile/row views, forms, controls, pickers, and panels should each have a focused component file. Composer components assemble these parts. Do not split every wrapper, label, or icon into its own component without an independent responsibility.
- Keep primitives together according to shadcn conventions; compound primitive exports may share a file. Install primitives with the shadcn CLI, not hand-written substitutes.
- Export components through the package's public paths. Do not add application dependencies to make a view work. Preserve `src/boundaries.test.ts` and extend it when a new application dependency needs to be excluded.
- Add Storybook stories for new or moved presentation and compose the actual UI components in scenes. Do not recreate the production view inside a story. Cover applicable ready, loading, error/retry, empty, unavailable, pending, and input-preservation states.

- Test UI behavior, accessibility, and layout with Playwright. Use Storybook scenes for isolated workflows and applicable loading, error, empty, and unavailable states.
- Assert visible and accessible behavior through roles and accessible names, not rendered HTML strings, snapshots, or markup substring checks.
- Use unit tests for non-UI logic and application policies.
- Verify retry behavior and input preservation in affected workflows.
- Use shared theme tokens for colors, radii, and elevation. Support light and dark themes and reduced motion.

## Entity references

- Reuse consistent reference, preview, and related-context components across domains when those components exist.
- Keep domain data fetching and authorization outside presentation components.
- Support deleted, unavailable, and inaccessible reference states without exposing private metadata.
- Make references keyboard-accessible and usable as navigation links where navigation is supported.

## Loading, error, and action states

- Use shared feedback components, not bare loading text or raw errors.
- Match skeletons to content, keep layout stable, label loading accessibly, and hide decorative placeholders from screen readers.
- Keep loading, error, empty, and unavailable states distinct. Distinguish temporary failures from expired invitations, invalid links, and access restrictions.
- Give content errors a clear title, useful description, and retry action when possible. Match the state's size to its container.
- Preserve valid content during background refreshes; show refresh errors without blocking usable content.
- Keep action errors near the relevant control and preserve user input. Do not use form feedback for content-loading failures.
- Show pending actions with a progress indicator and action label. Prevent duplicate submissions without replacing the whole form.
- Map server failures to safe user-facing copy while preserving useful validation guidance.
