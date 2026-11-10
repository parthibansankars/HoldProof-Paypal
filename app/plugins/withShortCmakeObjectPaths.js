/**
 * Windows build fix: React Native's autolinked C++ code produces object-file paths longer than
 * Windows' 260-character limit (e.g. ...react_codegen_safeareacontext.dir/D_/.../ComponentDescriptors.cpp.o).
 * CMAKE_OBJECT_PATH_MAX makes CMake shorten long object paths with a hash, so the build works
 * without enabling Windows long paths. Harmless on macOS and Linux.
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '-DCMAKE_OBJECT_PATH_MAX=';

module.exports = function withShortCmakeObjectPaths(config, { max = 240 } = {}) {
  return withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;
    if (!gradle.includes(MARKER)) {
      gradle = gradle.replace(
        /defaultConfig\s*\{/,
        (m) => `${m}\n        externalNativeBuild {\n            cmake {\n                arguments "${MARKER}${max}"\n            }\n        }`,
      );
      cfg.modResults.contents = gradle;
    }
    return cfg;
  });
};
