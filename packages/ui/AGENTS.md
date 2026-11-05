# Shared UI

- Test UI behavior, accessibility, and layout in a real browser with Playwright. Use the Storybook scenes for isolated UI workflows.
- Do not test rendered HTML strings, HTML snapshots, or whether markup contains text, tags, classes, or attributes. Assert visible behavior through Playwright roles and accessible names instead.
- Keep unit tests for non-UI logic and application policies.
- Use shared theme tokens for colors, radii, and elevation. Support light and dark themes and reduced motion.
