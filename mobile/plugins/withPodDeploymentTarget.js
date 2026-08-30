const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Raise IPHONEOS_DEPLOYMENT_TARGET on every pod to the app's minimum.
 *
 * Several third-party podspecs still declare iOS 9/10 (AppAuth, GoogleSignIn,
 * GTMSessionFetcher, SDWebImage, Sentry). Xcode warns on anything below 12.0
 * and will eventually refuse it outright.
 *
 * `expo-build-properties` sets the *app* target but does not rewrite what
 * dependencies declare, and `ios/` is generated — a hand-edited Podfile is
 * erased by the next `expo prebuild`, which is exactly what happened to an
 * earlier version of this fix. Injecting the hook from a plugin means it is
 * reapplied on every prebuild.
 *
 * Resource-bundle targets are covered too: those are where most of the
 * remaining warnings come from, and the usual pod-only loop misses them.
 */
const MIN = '15.1';

const HOOK = `
    # ── injected by plugins/withPodDeploymentTarget.js ──
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        current = config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current.nil? || Gem::Version.new(current) < Gem::Version.new('${MIN}')
          config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${MIN}'
        end
      end
    end
    # Resource bundles are separate projects and keep their own (older) target.
    installer.generated_projects.each do |project|
      project.targets.each do |target|
        target.build_configurations.each do |config|
          config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${MIN}'
        end
      end
    end
`;

module.exports = function withPodDeploymentTarget(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfile, 'utf8');

      if (contents.includes('withPodDeploymentTarget.js')) return cfg;

      // Must go INSIDE the existing `post_install do |installer|`, before its
      // closing `end`. Declaring a second block would silently win over the
      // first and skip react_native_post_install, breaking the RN build.
      const anchor = contents.lastIndexOf('  post_install do |installer|');
      if (anchor === -1) {
        throw new Error(
          'withPodDeploymentTarget: no post_install block found in the Podfile. ' +
            'The Expo template changed; update this plugin rather than editing ios/ by hand.',
        );
      }

      const blockEnd = contents.indexOf('\n  end', anchor);
      if (blockEnd === -1) {
        throw new Error('withPodDeploymentTarget: could not find the end of post_install.');
      }

      contents = contents.slice(0, blockEnd) + '\n' + HOOK + contents.slice(blockEnd);

      fs.writeFileSync(podfile, contents);
      return cfg;
    },
  ]);
};
