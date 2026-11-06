import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";

const headless = process.env.STORYBOOK_HEADLESS === "true";

const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: ["../src/**/*.stories.tsx"],
  addons: headless ? [] : ["@storybook/addon-a11y"],
  core: { disableTelemetry: true },
  viteFinal: async (config) => ({ ...config, plugins: [...(config.plugins || []), tailwindcss()] }),
};

export default config;
