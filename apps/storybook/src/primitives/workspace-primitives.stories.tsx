import type { Meta, StoryObj } from "@storybook/react-vite";
import { Inbox, Plus } from "lucide-react";
import { Button } from "@startup-os/ui/primitives/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@startup-os/ui/primitives/dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@startup-os/ui/primitives/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@startup-os/ui/primitives/item";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@startup-os/ui/primitives/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@startup-os/ui/primitives/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@startup-os/ui/primitives/tooltip";

const meta = {
  title: "Primitives/Workspace patterns",
  parameters: { layout: "centered" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const EmptyState: Story = {
  render: () => (
    <Empty className="min-h-64">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Inbox aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>No tasks yet</EmptyTitle>
        <EmptyDescription>Create a task to start tracking this project.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button>
          <Plus aria-hidden="true" />
          New task
        </Button>
      </EmptyContent>
    </Empty>
  ),
};

export const ListItem: Story = {
  render: () => (
    <Item variant="outline" className="w-80">
      <ItemMedia variant="icon">
        <Inbox aria-hidden="true" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>Launch planning</ItemTitle>
        <ItemDescription>Project discussion</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button variant="outline" size="sm">
          Open
        </Button>
      </ItemActions>
    </Item>
  ),
};

export const TabNavigation: Story = {
  render: () => (
    <Tabs defaultValue="tasks" className="w-80">
      <TabsList aria-label="Project view">
        <TabsTrigger value="tasks">Tasks</TabsTrigger>
        <TabsTrigger value="details">Details</TabsTrigger>
      </TabsList>
      <TabsContent value="tasks">Project tasks</TabsContent>
      <TabsContent value="details">Project details</TabsContent>
    </Tabs>
  ),
};

export const SplitPane: Story = {
  parameters: { layout: "padded" },
  render: () => (
    <div className="mx-auto h-64 w-80 max-w-full border sm:w-xl">
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel defaultSize="60%" minSize="30%">
          <div className="p-4">Messages</div>
        </ResizablePanel>
        <ResizableHandle aria-label="Resize thread" withHandle />
        <ResizablePanel defaultSize="40%" minSize="25%">
          <div className="p-4">Thread</div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  ),
};

export const Modal: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Open dialog</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Project details</DialogTitle>
          <DialogDescription>Review this project before making changes.</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  ),
};

export const IconTooltip: Story = {
  render: () => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon" aria-label="New task">
            <Plus aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>New task</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ),
};
