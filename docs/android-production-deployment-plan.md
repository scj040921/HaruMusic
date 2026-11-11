# HaruMusic Android 嵌入式 API 与发布方案

检查日期：2026-11-11

## 当前 Android 联网实现

- Android APK 将使用 Capawesome 的 Capacitor Node.js 插件嵌入 Node.js Mobile 18.20.4，并在应用内部启动项目已有的 `netease-cloud-music-api-alger` 4.32.0 API 服务。插件提供 16 KB 页对齐的 Android 运行库。
- Node API 与桌面端一样只绑定 `127.0.0.1`，Android WebView 通过回环地址访问；Node API 的公网请求直接使用手机的系统网络、VPN 与 DNS，不再要求 VPS 中转。
- Android 端的 Node.js 服务运行在应用进程中，不开放局域网端口。Android 杀掉应用进程后，服务会随进程结束；下次打开应用时自动重启。
- 嵌入 Node.js 会使 APK 增加数十 MB；构建默认只包含 `arm64-v8a`，可用 `ANDROID_ABI_FILTERS` 为其他设备选择 ABI。将多个 ABI 放进同一个 APK 会明显放大包体。
- Android 构建默认 `ANDROID_API_MODE=embedded`。只有明确设置为 `remote` 时才使用 `VITE_API` 远程 HTTPS 地址。
- 桌面端仍由 Electron 主进程启动服务并监听 `127.0.0.1`；Android 使用 Capacitor 插件启动相同 API 包。
- Android 本地 API 健康检查与 CORS 由 `deployment/android-node-api/` 提供；公网容器方案仍保留在 `deployment/music-api/` 作为以后切换选项。
- HaruMusic GitHub 仓库是私有仓库。当前更新清单中的 APK 链接指向该私有仓库，匿名手机用户无法下载。
- 账号已有公开 GitHub Pages：<https://scj040921.github.io/haruapps/>。可作为公开更新清单的托管位置。
- 未找到 HaruMusic 专用 Release keystore。现有 Android debug 密钥及 Resume Studio 签名文件不能代替 HaruMusic Release 密钥。
- GitHub Actions 尚未配置公开更新清单变量或签名 secrets。

## 推荐发布拓扑

```text
HaruMusic Android
  ├─ 音乐 API ── APK 内 Node.js Mobile ── HTTPS ── 网易云及已配置的音源
  └─ 版本清单 ── HTTPS ── scj040921.github.io/haruapps/android/update-feed.json
                                └─ APK 下载 ── 公开 HaruApps GitHub Release
                                               └─ GH-Proxy 可作为可选下载加速
```

### 1. APK 内音乐 API

`deployment/android-node-api/` 使用独立锁文件构建 Node 18 运行时所需依赖。`scripts/build-android.mjs` 会在 Android 构建时安装这些依赖并随 Web 资源打入 APK；Capacitor 插件再从 APK 启动 `server.cjs`。它先启动只监听 loopback 的 Netease API，再提供本地健康检查和代理入口。登录 Cookie 查询日志已关闭。

应用初次打开时启动 Node Runtime；渲染层的 API 请求等待服务健康检查通过后再发出。WebView 重载时会探测固定的 `127.0.0.1:30488`，复用当前 Node Runtime，不重复启动。

旧 VPS 容器方案 `deployment/music-api/` 保留为可选远程部署，不是当前 Android 联网的前置条件。

### 2. 更新清单和 APK 分发

更新清单可部署到已有的 HaruApps GitHub Pages 静态站点，固定地址规划为：

`https://scj040921.github.io/haruapps/android/update-feed.json`

APK 文件需要放在公开可匿名下载的位置。建议由 HaruMusic Actions 将 APK 发布到公开的 `scj040921/haruapps` Release，并将该公开资产 URL 写入更新清单。这样不需要把 HaruMusic 源码仓库设为公开。

此跨仓库发布需要 `scj040921/haruapps` 的最小权限 GitHub Actions token，以及更新 Pages 静态内容的工作流。部署前需先配置该 token；不得将 token 编入 APK。发布后可选用 GH-Proxy 加速公开 APK 下载，但 APK 更新链接本身应保留直接 HTTPS 地址作为回退。

### 3. GH-Proxy 的适用范围

GH-Proxy 支持 GitHub Releases、Raw 文件和 GitHub API 等 GitHub 资源（[官方使用文档](https://gh-proxy.com/docs/github-accelerator)）。它不能替代本项目的 Netease 兼容音乐 API，也不能代理桌面机上的 `127.0.0.1` 服务。因此只将它用于可选的公开 APK 下载加速，不用于登录、歌曲搜索或播放 API。

### 4. 正式签名

正式 APK 必须使用 HaruMusic 专用且可长期保存的 Release keystore。每次更新都要使用同一把私钥，否则 Android 会拒绝覆盖安装。当前尚未定位到此文件；不要误用 `debug.keystore` 或 Resume Studio 的签名文件。

应将 keystore 和以下参数存到 GitHub Actions Secrets；若先本机签名，则使用本机环境变量，不把密码写入仓库：

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

## 发布配置清单

GitHub Actions Variables：

- `VITE_UPDATE_FEED_URL`：公开更新清单 HTTPS 地址。

如需临时切换远程 API，可在构建时设置 `ANDROID_API_MODE=remote` 并提供 `VITE_API` HTTPS 地址；默认正式 APK 使用嵌入式 API。

GitHub Actions Secrets：

- 上述 Android 签名参数。
- 发布到公开 `haruapps` 仓库和 Pages 内容时使用的最小权限发布 token。

## 验收顺序

1. 运行 `npm run test:android-api-smoke`，检查本地 API 启动、健康检查、CORS 预检和 API 代理。
2. 构建 APK，并在真机上验证启动期间 API 就绪、首页数据、搜索、歌曲播放与登录 Cookie。
3. 在公开 Pages 放置测试清单，并用未登录浏览器确认可读。
4. 使用 HaruMusic Release keystore 构建签名 APK，确认安装更新和更新检测。
5. 发布正式 APK 和清单，确认下载无需 GitHub 登录；再验证 GH-Proxy 加速链接和直连回退。

## 尚需提供或配置

1. HaruMusic Release keystore 本机路径和 alias。密码通过本机环境变量或 GitHub Secrets 配置。
2. 是否授权将签名 APK 发布到公开的 `scj040921/haruapps` Releases，并由 Actions 更新公开 Pages 清单。
