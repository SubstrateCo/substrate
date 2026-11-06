import type { Meta, StoryObj } from "@storybook/react-vite";
import { Alert, AlertTitle, AlertDescription } from "@startup-os/ui/primitives/alert";

const meta = {
  title: "Primitives/Feedback/Alert",
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-xl p-8">
        <Story />
      </div>
    ),
  ],
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {
  render: () => (
    <Alert>
      <AlertTitle>All set</AlertTitle>
      <AlertDescription>Your changes are saved.</AlertDescription>
    </Alert>
  ),
};
export const Destructive: Story = {
  render: () => (
    <Alert variant="destructive">
      <AlertTitle>Could not save</AlertTitle>
      <AlertDescription>Check your connection and try again.</AlertDescription>
    </Alert>
  ),
};
