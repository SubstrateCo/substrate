import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { NotFound } from "@startup-os/ui/feedback/not-found";
import { ErrorScreen } from "@startup-os/ui/feedback/error-screen";

const meta = { title: "Scenes/Feedback" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const PageNotFound: Story = {
  render: () => <NotFound homeLink={<a href="#home">Return home</a>} />,
};
export const UnexpectedError: Story = { render: () => <ErrorScreen onRetry={fn()} /> };
