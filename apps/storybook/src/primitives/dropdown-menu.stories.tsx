import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@startup-os/ui/primitives/dropdown-menu";
import { Button } from "@startup-os/ui/primitives/button";

const meta = {
  title: "Primitives/Overlays/Dropdown menu",
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">Open menu</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>Messages</DropdownMenuItem>
        <DropdownMenuItem>Settings</DropdownMenuItem>
        <DropdownMenuItem disabled>Unavailable</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};
