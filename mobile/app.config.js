/**
 * Dynamic Expo config.
 *
 * Everything lives in app.json; this wrapper exists for the one decision that
 * genuinely depends on the environment — whether to run Sentry's source-map
 * upload during a native build.
 *
 * The `@sentry/react-native/expo` plugin installs an Xcode "Upload Debug
 * Symbols to Sentry" build phase that shells out to sentry-cli. sentry-cli
 * requires an organisation and project; without them it exits non-zero and
 * takes the whole build with it:
 *
 *     error: An organization ID or slug is required (provide with --org)
 *     ...
 *     "xcodebuild" exited with error code 65
 *
 * app.json is static JSON and cannot read env, so the plugin was unconditional
 * and every build failed on a machine without Sentry credentials. Here the
 * plugin is included only when it can actually succeed.
 *
 * To enable source-map upload, set these before building (see .env.example):
 *   SENTRY_ORG, SENTRY_PROJECT, SENTRY_AUTH_TOKEN
 *
 * Runtime crash reporting is independent of this — it is driven by
 * EXPO_PUBLIC_SENTRY_DSN and works whether or not source maps are uploaded.
 * Without the upload, stack traces are simply less readable.
 */
const SENTRY_PLUGIN = '@sentry/react-native/expo';

/** sentry-cli needs all three, and fails the build if any is missing. */
const sentryUploadConfigured = Boolean(
  process.env.SENTRY_ORG && process.env.SENTRY_PROJECT && process.env.SENTRY_AUTH_TOKEN,
);

module.exports = ({ config }) => {
  const plugins = (config.plugins ?? []).filter((p) => {
    const name = Array.isArray(p) ? p[0] : p;
    return name !== SENTRY_PLUGIN;
  });

  if (sentryUploadConfigured) {
    plugins.push([
      SENTRY_PLUGIN,
      {
        organization: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
      },
    ]);
  }

  return { ...config, plugins };
};
