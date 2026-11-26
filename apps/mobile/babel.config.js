// NativeWind's preset names plugins it does not depend on. Isolated installs cannot resolve them from
// the preset's own folder, so resolve them from this app, which declares them.
function nativewindPreset() {
  const {
    plugins: [cssInteropPlugin, [jsxPlugin, jsxOptions], reanimatedPlugin],
  } = require("nativewind/babel")();
  return {
    plugins: [
      cssInteropPlugin,
      [require.resolve(jsxPlugin), jsxOptions],
      require.resolve(reanimatedPlugin),
    ],
  };
}

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }], nativewindPreset],
  };
};
