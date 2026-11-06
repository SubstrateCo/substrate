# Shared UI

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
