import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Input } from "@startup-os/ui/primitives/input";
import { Textarea } from "@startup-os/ui/primitives/textarea";
import { Label } from "@startup-os/ui/primitives/label";
import { Separator } from "@startup-os/ui/primitives/separator";
import { Button } from "@startup-os/ui/primitives/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@startup-os/ui/primitives/card";
import { Alert, AlertTitle, AlertDescription } from "@startup-os/ui/primitives/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@startup-os/ui/primitives/select";
import { Popover, PopoverContent, PopoverTrigger } from "@startup-os/ui/primitives/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@startup-os/ui/primitives/dropdown-menu";
import { FormMessage } from "@startup-os/ui/auth/form-message";
import { AuthFrame } from "@startup-os/ui/auth/auth-frame";

const meta = {
  title: "Components/Primitives",
  decorators: [
    (Story) => (
      <div className="flex min-h-screen items-center justify-center p-8">
        <div className="max-w-xl space-y-5">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Fields: Story = {
  render: () => (
    <>
      <Label htmlFor="name">Workspace name</Label>
      <Input id="name" placeholder="Launch Studio" />
      <Label htmlFor="disabled">Disabled field</Label>
      <Input id="disabled" defaultValue="Read only preview" disabled />
      <Label htmlFor="invalid">Invalid field</Label>
      <Input id="invalid" defaultValue="Invalid value" aria-invalid />
      <Label htmlFor="message">Message</Label>
      <Textarea id="message" placeholder="Write a message…" />
      <Textarea aria-label="Disabled message" disabled defaultValue="Sending…" />
    </>
  ),
};
export const WorkspaceCard: Story = {
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
export const Alerts: Story = {
  render: () => (
    <>
      <Alert>
        <AlertTitle>All set</AlertTitle>
        <AlertDescription>Your changes are saved.</AlertDescription>
      </Alert>
      <Alert variant="destructive">
        <AlertTitle>Could not save</AlertTitle>
        <AlertDescription>Check your connection and try again.</AlertDescription>
      </Alert>
      <FormMessage message="Invitation email sent." />
      <FormMessage error={new Error("Could not send the invitation.")} />
    </>
  ),
};
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
export const RoleSelector: Story = { render: () => <RoleSelect /> };
export const PopoverMenu: Story = {
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
export const Dropdown: Story = {
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
export const Dividers: Story = {
  render: () => (
    <>
      <p>Messages</p>
      <Separator />
      <p>Workspace settings</p>
    </>
  ),
};
export const AuthenticationFrame: Story = {
  render: () => (
    <AuthFrame title="Welcome back" description="Sign in to your workspace.">
      <p>Shared authentication layout.</p>
    </AuthFrame>
  ),
};
