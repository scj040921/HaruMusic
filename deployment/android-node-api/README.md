# Android 本地音乐 API

该项目把桌面端使用的 `netease-cloud-music-api-alger` API 一并放进 Android APK，并由 `@capawesome/capacitor-nodejs` 在 Android 应用进程中启动。

`npm run build:android` 默认执行以下准备：

1. 以独立 `package-lock.json` 安装 Node 18.20.4 可运行的 API 依赖。
2. 将 API 项目复制到 Capacitor Web 资源目录 `out/renderer/nodejs`。
3. 同步 Capacitor Android 插件并构建 APK。

Android API 网关固定监听 `127.0.0.1:30488`，上游 API 在相邻本地端口监听。它们不绑定局域网接口。Android WebView 启动后等待 `/__health` 返回 HaruMusic 服务标记，再发送正常 API 请求。网页重载时会复用仍在运行的 Node Runtime。

本地自动冒烟检查：

```sh
npm run test:android-api-smoke
```

此检查使用本机 Node.js 模拟 Capacitor bridge，验证 API 启动、健康检查、CORS 预检和本地代理。完整 Android Runtime 仍需通过 Gradle 构建和 Android 真机验收。
