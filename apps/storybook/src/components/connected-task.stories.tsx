import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { TaskForm } from "@startup-os/ui/tasks/task-form";
import { taskProject } from "../scenes/tasks-fixtures";

const meta = {
  title: "Components/Connected task",
  component: TaskForm,
  args: {
    detail: taskProject,
    sourceText: "Customer asked for a launch checklist.",
    onSubmit: fn(),
    onCancel: fn(),
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-2xl p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TaskForm>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Source: Story = {};
export const Saving: Story = { args: { pending: true } };
export const Failed: Story = { args: { error: new Error("Request failed") } };
export const DarkSource: Story = { globals: { theme: "dark" } };
