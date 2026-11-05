import type { Preview } from "@storybook/react-vite";
import { ThemePreview } from "./theme-preview";
import "../src/styles.css";

const preview: Preview = {
  globalTypes: {
    theme: {
      description: "Color theme",
      toolbar: { icon: "paintbrush", items: ["light", "dark"], dynamicTitle: true },
    },
  },
  initialGlobals: { theme: "light" },
  decorators: [
    (Story, context) => (
      <ThemePreview dark={context.globals.theme === "dark"}>
        <Story />
      </ThemePreview>
    ),
  ],
  parameters: {
    layout: "fullscreen",
    options: { storySort: { order: ["Scenes", "Components", "Foundations"] } },
    viewport: {
      options: {
        narrow: { name: "Mobile 320", styles: { width: "320px", height: "740px" } },
        mobile: { name: "Mobile 390", styles: { width: "390px", height: "844px" } },
        desktop: { name: "Desktop", styles: { width: "1440px", height: "900px" } },
      },
    },
  },
};

export default preview;
