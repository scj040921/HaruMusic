# Android builds and updates

Android embeds its loopback music API. `npm run build:android` produces a debug APK; set `ANDROID_ABI_FILTERS` to `x86_64` for the emulator or leave the default `arm64-v8a` for phones.

Release builds require the HaruMusic signing keystore through `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`. The release must use the same APK signing certificate for later in-place updates. On this workstation the dedicated keystore is stored under the current user's Android directory and its credentials are protected with Windows DPAPI. Keep a separate secure backup: losing the keystore prevents signing compatible updates.

The Android client reads `android-{channel}.json` from the public `scj040921/haruapps` Release tagged `harumusic-update-channels`. Nightly, Acceptance, and Stable have independent assets. The feed contains a base64 JSON payload and an RSA SHA-256 signature; the app verifies it against its embedded public key before offering a download. APK installation remains subject to Android's signing and installation checks. The manifest records the package SHA-256 and size; the browser download path does not itself verify the hash.

`scripts/write-update-manifest.mjs` requires `CHANNEL`, `VERSION`, `TAG`, `BUILD_TYPE`, and `ANDROID_UPDATE_SIGNING_KEY`. The signing key must never be committed or included in the APK. Publish the APK Release first, then upload the channel's signed JSON asset to `harumusic-update-channels` only after verifying the package and download.

The private HaruMusic repository has signing secrets for the APK and feed. GitHub Actions needs an additional `HARUAPPS_RELEASE_TOKEN` secret with permission to create Releases and upload assets in the separate public `scj040921/haruapps` repository. Without it the workflow can build an artifact but cannot publish across repositories. No token is bundled in the application.

Use Nightly for initial distribution and validate installation, playback, updates, and HyperOS media behavior on a real phone before promoting a build to Stable.
