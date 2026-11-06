import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { Button } from "@startup-os/ui/primitives/button";

const meta = {
  title: "Primitives/Actions/Button",
  component: Button,
  args: { children: "Button", onClick: fn() },
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "outline", "secondary", "ghost", "destructive", "link"],
    },
    size: {
      control: "select",
      options: ["default", "xs", "sm", "lg", "icon", "icon-xs", "icon-sm", "icon-lg"],
    },
  },
  decorators: [
    (Story) => (
      <div className="flex min-h-screen items-center justify-center p-8">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Outline: Story = { args: { variant: "outline" } };
export const Secondary: Story = { args: { variant: "secondary" } };
export const Ghost: Story = { args: { variant: "ghost" } };
export const Destructive: Story = { args: { variant: "destructive" } };
export const Link: Story = { args: { variant: "link" } };
export const Disabled: Story = { args: { disabled: true } };
export const Sizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      {(["xs", "sm", "default", "lg"] as const).map((size) => (
        <Button key={size} size={size}>
          {size}
        </Button>
      ))}
      {(["icon-xs", "icon-sm", "icon", "icon-lg"] as const).map((size) => (
        <Button key={size} size={size} aria-label={`Add (${size})`}>
          +
        </Button>
      ))}
    </div>
  ),
};
