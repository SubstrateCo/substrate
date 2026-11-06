# Shared UI

- Design shared components for the Startup OS Electron desktop app. The web app is its rendering layer, not a separate browser-first product.
- Test UI behavior, accessibility, and layout in a real browser with Playwright. Use the Storybook scenes for isolated UI workflows.
- Do not test rendered HTML strings, HTML snapshots, or whether markup contains text, tags, classes, or attributes. Assert visible behavior through Playwright roles and accessible names instead.
- Keep unit tests for non-UI logic and application policies.
- Use shared theme tokens for colors, radii, and elevation. Support light and dark themes and reduced motion.

## Entity references

- Reuse consistent reference, preview, and related-context components across domains when those components exist.
- Keep domain data fetching and authorization outside presentation components.
- Support deleted, unavailable, and inaccessible reference states without exposing private metadata.
- Make references keyboard-accessible and usable as navigation links where navigation is supported.

## Loading, error, and action states

- Reuse shared feedback components. Do not use bare “Loading…” text or a raw error message as the complete state for fetched content.
- Match loading skeletons to the content they replace. Keep the surrounding layout stable, provide an accessible status label, and hide decorative placeholders from screen readers.
- Give content errors a clear title, useful user-facing description, and a retry action when recovery is possible. Use a compact state in menus and a larger state in cards or panes.
- Keep loading, error, empty, and unavailable states distinct. Do not show an empty state when a request is loading or has failed. Distinguish temporary failures from expired invitations, invalid links, and access restrictions.
- Keep existing content visible during background refreshes when it is still valid. Show refresh failures without replacing usable content with a blocking error.
- Keep form and action errors near the relevant form or control. Preserve user input after failure. Use form feedback for actions, not as a substitute for a content-loading error state.
- Show pending actions with a progress indicator and action label. Prevent duplicate submissions without replacing the whole form with a loading state.
- Do not display unreviewed server error messages directly. Map failures to safe, useful copy; retain specific validation guidance where appropriate.
- Add Storybook coverage for loading, error, empty, and unavailable states where applicable. Verify retry and input preservation with Playwright for affected workflows.
