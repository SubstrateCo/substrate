import type { Meta, StoryObj } from "@storybook/react-vite";
import { Popover, PopoverContent, PopoverTrigger } from "@startup-os/ui/primitives/popover";
import { Button } from "@startup-os/ui/primitives/button";
import { Separator } from "@startup-os/ui/primitives/separator";

const meta = {
  title: "Primitives/Overlays/Popover",
  decorators: [
    (Story) => (
      <div className="flex min-h-screen items-center justify-center p-8">
        <Story />
      </div>
    ),
  ],
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">Open popover</Button>
      </PopoverTrigger>
      <PopoverContent>
        <p>Workspace controls</p>
        <Separator className="my-3" />
        <p className="text-sm text-muted-foreground">Shared styles and focus behavior.</p>
      </PopoverContent>
    </Popover>
  ),
};
