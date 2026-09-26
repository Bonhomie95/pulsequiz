const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

/**
 * Adopt the UIKit scene-based life cycle on iOS.
 *
 * iOS 27 refuses to launch an app built against its SDK unless the app adopts
 * UIScene — "Application failed to launch: UIScene life cycle is required for
 * apps built with this SDK" — and it dies before any JavaScript runs.
 *
 * Expo SDK 57 ships `ExpoAppSceneDelegate`, which does the real work (creating
 * the window from the connecting scene, starting React Native in it, and
 * re-feeding scene URL / user-activity / quick-action events to the app
 * delegate). It is not opt-in by default, so prebuild still emits the legacy
 * app delegate that builds its own window. This plugin wires it up.
 *
 * Three changes have to agree, which is why they live together:
 *  1. The app delegate stops creating the window — the scene delegate owns it.
 *  2. The app delegate conforms to `ExpoReactNativeFactoryProvider` so the
 *     scene delegate can reach the factory it built.
 *  3. Info.plist names the scene delegate class.
 *
 * `SceneDelegate` is declared in AppDelegate.swift rather than its own file
 * purely so the plugin never has to add a source file to the Xcode project.
 */

const SCENE_DELEGATE = `
/// Owns the window under the scene life cycle; see withIosSceneLifecycle.js.
class SceneDelegate: ExpoAppSceneDelegate {}
`;

function patchAppDelegate(contents) {
  if (contents.includes('class SceneDelegate')) return contents;

  let out = contents;

  // 1. Conform, so ExpoAppSceneDelegate can find the factory and set the window.
  const classDecl = 'class AppDelegate: ExpoAppDelegate {';
  if (!out.includes(classDecl)) {
    throw new Error('withIosSceneLifecycle: unexpected AppDelegate class declaration');
  }
  out = out.replace(classDecl, 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {');

  // 2. Hand the window over. Under the scene life cycle UIKit connects a
  //    UIWindowScene and the scene delegate builds the window from it; a window
  //    made here would never be attached to a scene.
  const windowBlock = /#if os\(iOS\) \|\| os\(tvOS\)\s*\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\s*\n\s*factory\.startReactNative\([\s\S]*?\)\s*\n#endif\n/;
  if (!windowBlock.test(out)) {
    throw new Error('withIosSceneLifecycle: could not find the window setup to remove');
  }
  out = out.replace(
    windowBlock,
    '    // The window is created by SceneDelegate under the scene life cycle.\n',
  );

  return out.trimEnd() + '\n' + SCENE_DELEGATE;
}

module.exports = function withIosSceneLifecycle(config) {
  config = withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== 'swift') {
      throw new Error('withIosSceneLifecycle: expected a Swift AppDelegate');
    }
    cfg.modResults.contents = patchAppDelegate(cfg.modResults.contents);
    return cfg;
  });

  return withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    };
    return cfg;
  });
};
