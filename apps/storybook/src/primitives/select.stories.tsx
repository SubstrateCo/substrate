import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Label } from "@startup-os/ui/primitives/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@startup-os/ui/primitives/select";

function RoleSelect() {
  const [value, setValue] = useState("member");
  return (
    <div className="space-y-2">
      <Label htmlFor="role">Role</Label>
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger id="role">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="member">Member</SelectItem>
          <SelectItem value="admin">Admin</SelectItem>
          <SelectItem value="owner">Owner</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
const meta = {
  title: "Primitives/Forms/Select",
  component: RoleSelect,
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-sm p-8">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RoleSelect>;
export default meta;
type Story = StoryObj<typeof meta>;
export const RoleSelector: Story = {};
