import type { Meta, StoryObj } from "@storybook/react-vite";
import { EntityReference } from "@startup-os/ui/messaging/entity-reference";
import { MessageMarkdown } from "@startup-os/ui/messaging/message-markdown";
import { referenceFixtures, referencedBody } from "../scenes/reference-fixtures";

const meta = {
  title: "Messaging/Components/References/Inline reference",
  component: EntityReference,
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-2xl p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof EntityReference>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Task: Story = { args: { reference: referenceFixtures[0] } };
export const Project: Story = { args: { reference: referenceFixtures[2] } };
export const Person: Story = { args: { reference: referenceFixtures[3] } };
export const Unavailable: Story = {};
export const Loading: Story = { args: { loading: true } };
export const InMessage: Story = {
  render: () => <MessageMarkdown body={referencedBody} references={referenceFixtures} />,
};
export const MissingTarget: Story = {
  render: () => <MessageMarkdown body={referencedBody} references={[]} />,
};
export const Formatting: Story = {
  render: () => (
    <MessageMarkdown
      body={`**Review @[task:11111111-1111-4111-8111-111111111111] today.**\n\n- Ask @[person:44444444-4444-4444-8444-444444444444]\n\nLiteral code: \`@[task:11111111-1111-4111-8111-111111111111]\``}
      references={referenceFixtures}
    />
  ),
};
