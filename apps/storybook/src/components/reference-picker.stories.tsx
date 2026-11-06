import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ReferencePicker } from "@startup-os/ui/messaging/reference-picker";
import { referenceFixtures } from "../scenes/reference-fixtures";

const meta = {
  title: "Messaging/Components/References/Picker",
  component: ReferencePicker,
  args: {
    query: "",
    kind: "task",
    results: referenceFixtures
      .filter((item) => item.kind === "task")
      .map((item) => ({ id: item.id, title: item.label })),
    onInsert: fn(),
    onClose: fn(),
    onQueryChange: fn(),
    onKindChange: fn(),
    onRetry: fn(),
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-xl p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ReferencePicker>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Tasks: Story = {};
export const Projects: Story = {
  args: {
    kind: "project",
    results: referenceFixtures
      .filter((item) => item.kind === "project")
      .map((item) => ({ id: item.id, title: item.label })),
  },
};
export const People: Story = {
  args: {
    kind: "person",
    results: referenceFixtures
      .filter((item) => item.kind === "person")
      .map((item) => ({ id: item.id, title: item.label })),
  },
};
export const Empty: Story = { args: { results: [] } };
export const Loading: Story = { args: { results: [], loading: true } };
export const Failed: Story = { args: { results: [], error: new Error("Request failed") } };
