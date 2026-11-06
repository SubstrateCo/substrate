import type { Meta, StoryObj } from "@storybook/react-vite";
import { FormMessage } from "@startup-os/ui/auth/form-message";

const meta = {
  title: "Components/Feedback/Form message",
  component: FormMessage,
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-xl p-8">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FormMessage>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Success: Story = { args: { message: "Invitation email sent." } };
export const Failed: Story = { args: { error: new Error("Could not send the invitation.") } };
