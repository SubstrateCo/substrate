const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// The web app uses a newer React. Shared workspace packages must use the React that this Expo SDK supports.
const singletons = ["react", "react-dom", "react-native", "react-native-web"];
const projectOrigin = path.join(__dirname, "package.json");
const upstreamResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = upstreamResolveRequest ?? context.resolveRequest;
  const isSingleton = singletons.some(
    (name) => moduleName === name || moduleName.startsWith(`${name}/`),
  );
  return resolve(
    isSingleton ? { ...context, originModulePath: projectOrigin } : context,
    moduleName,
    platform,
  );
};

module.exports = withNativeWind(config, { input: "./global.css", inlineRem: 16 });
