import type { Meta, StoryObj } from "@storybook/react-vite";
import { ReferenceComposerScene } from "./reference-composer-scene";

const meta = {
  title: "Messaging/Scenes/Reference Composer",
  component: ReferenceComposerScene,
} satisfies Meta<typeof ReferenceComposerScene>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Suggested: Story = {};
export const StartTyping: Story = { args: { initialDraft: "" } };
export const InsertedReferences: Story = {
  args: {
    initialDraft:
      "Ask @[person:44444444-4444-4444-8444-444444444444] to review @[task:11111111-1111-4111-8111-111111111111] for @[project:33333333-3333-4333-8333-333333333333].",
  },
};
export const UnavailableReference: Story = {
  args: { initialDraft: "Review @[task:99999999-9999-4999-8999-999999999999] before launch." },
};
export const DarkInsertedReferences: Story = {
  args: InsertedReferences.args,
  globals: { theme: "dark" },
};
export const LongInsertedReferences: Story = {
  args: { ...InsertedReferences.args, longNames: true, narrow: true },
};
export const MixedSearch: Story = { args: { initialDraft: "Can you review @launch" } };
export const Users: Story = { args: { initialDraft: "Can you review @user:" } };
export const Tasks: Story = { args: { initialDraft: "Please check @task:" } };
export const Projects: Story = { args: { initialDraft: "Updates for @project:" } };
export const Loading: Story = { args: { state: "loading" } };
export const Empty: Story = { args: { initialDraft: "Keep this @user:nobody", state: "empty" } };
export const SearchError: Story = {
  args: { initialDraft: "Keep this @task:onboarding", state: "error" },
};
export const RefreshError: Story = { args: { state: "refresh-error" } };
export const LongNames: Story = { args: { longNames: true } };
export const Constrained: Story = { args: { narrow: true, longNames: true } };
export const Mobile: Story = { globals: { viewport: { value: "narrow" } } };
export const Dark: Story = { globals: { theme: "dark" } };
