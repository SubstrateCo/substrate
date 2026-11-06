import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@startup-os/ui/primitives/card";
import { Button } from "@startup-os/ui/primitives/button";

const meta = {
  title: "Primitives/Layout/Card",
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
export const Workspace: Story = {
  render: () => (
    <Card>
      <CardHeader>
        <CardTitle>Launch Studio</CardTitle>
        <CardDescription>Your team's shared workspace.</CardDescription>
      </CardHeader>
      <CardContent>
        <p>Messages, tasks, and docs in one place.</p>
      </CardContent>
      <CardFooter>
        <Button>Open workspace</Button>
      </CardFooter>
    </Card>
  ),
};
