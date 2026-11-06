import type { Meta, StoryObj } from "@storybook/react-vite";
import { AuthFrame } from "@startup-os/ui/auth/auth-frame";

const meta = {
  title: "Components/Authentication/Auth frame",
  component: AuthFrame,
  args: {
    title: "Welcome back",
    description: "Sign in to your workspace.",
    children: <p>Shared authentication layout.</p>,
  },
} satisfies Meta<typeof AuthFrame>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
