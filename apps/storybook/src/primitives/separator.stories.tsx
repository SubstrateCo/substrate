import type { Meta, StoryObj } from "@storybook/react-vite";
import { Separator } from "@startup-os/ui/primitives/separator";

const meta = {
  title: "Primitives/Layout/Separator",
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-xl space-y-5 p-8">
        <Story />
      </div>
    ),
  ],
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {
  render: () => (
    <>
      <p>Messages</p>
      <Separator />
      <p>Workspace settings</p>
    </>
  ),
};
