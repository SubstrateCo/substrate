import type { Meta, StoryObj } from "@storybook/react-vite";
import { TasksScene } from "./tasks-scene";

const meta = { title: "Projects/Scenes/Tasks", component: TasksScene } satisfies Meta<
  typeof TasksScene
>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Project: Story = {};
export const EmptyWorkspace: Story = { args: { state: "empty" } };
export const LoadingProjects: Story = { args: { state: "loading" } };
export const ProjectsError: Story = { args: { state: "error" } };
export const UnavailableWorkspace: Story = { args: { state: "unavailable" } };
export const EmptyProject: Story = { args: { projectState: "empty" } };
export const LoadingProject: Story = { args: { projectState: "loading" } };
export const ProjectError: Story = { args: { projectState: "error" } };
export const UnavailableProject: Story = { args: { projectState: "unavailable" } };
export const ViewOnly: Story = { args: { level: "view" } };
export const CommentError: Story = { args: { failComment: true } };
export const DarkProject: Story = { globals: { theme: "dark" } };
