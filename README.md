# HaruMusic

HaruMusic 是基于 [AlgerMusicPlayer](https://github.com/algerkong/AlgerMusicPlayer) 二次开发的桌面音乐播放器。当前工作重点为 Windows 桌面体验，项目仍处于早期开发阶段。

首页部分按钮试用第三方 Vue 组件库 [boardui-vue](https://github.com/nilptr/board-ui-vue)，它基于 BoardUI 免费版设计规范；相关许可见该依赖及其上游声明。

## 本地开发

需要 Node.js 22.12 或更高版本和 npm。在仓库根目录运行：

```powershell
npm install
npm run dev
```

构建 Windows x64 安装包：

```powershell
npm run build
npx electron-builder --win --x64 --publish never
```

HaruMusic 当前尚未配置自己的自动更新服务；请勿使用上游安装包更新本应用。原始版权和许可声明见 [LICENSE](LICENSE)。上游 README 另有使用范围声明，分发前应核对其适用条件及相关音乐内容授权。
