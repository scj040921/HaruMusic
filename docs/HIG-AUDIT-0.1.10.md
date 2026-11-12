# HaruMusic 0.1.10 HIG 巡检

检查依据：Apple 官方 [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)、[Motion](https://developer.apple.com/design/human-interface-guidelines/motion)、[Materials](https://developer.apple.com/design/human-interface-guidelines/materials)、[Launching](https://developer.apple.com/design/human-interface-guidelines/launching)。这是自查记录，不是 Apple 认证。

## 范围与修正

- 全局入口、移动导航、侧栏、播放器、歌词、设置和下载相关源码巡检。Android 下载页在 412×915 和 320×740 浏览器移动视口中截图检查了明暗外观；两种歌词模式测试了居中、长句换行和触摸拖动。浏览器的下载数据来自原生桥接模拟，不是系统下载成功的证据。
- 播放控制区移除两份局部深色渐变，使用贯穿整屏的同一氛围背景；正文、列表和歌词不加 backdrop-filter。
- 播放、暂停、上一首、下一首、顺序和队列改为原生 button 语义，补充名称；返回和收起补充键盘操作。主要触控目标至少 44 CSS px；新增下载控件为 44–48 CSS px，提供焦点轮廓。
- 下载页用标题、分组和细分割线组织，不用玻璃卡片承载列表。任务状态同时通过文字、进度和操作按钮表达，删除文件有确认。
- 支持 prefers-reduced-motion；新增开屏在减少动态效果模式下立即跳过。补充增加对比度和减少透明度的 CSS 适配。
- 开屏是应用首屏就绪后的可跳过品牌过渡，最长约 660ms，每个 WebView 会话只显示一次。原生启动页不增加强制等待，返回键可先跳过品牌过渡。
- Android 下载交给系统 DownloadManager，后台和网络等待由系统管理。Android 10+ 存入公共 Music/HaruMusic；较老系统存入应用专属 Music 目录。暂停与继续交给系统网络调度，应用显示等待状态并提供取消、重试。

## 未闭环项

- Android WebView 不等于 UIKit：系统 SF Symbols、完整 Dynamic Type、iOS 材质 API不能直接作为已实现能力。
- 未证明所有页面在 200% 大字体下都能保持完整布局；部分旧页面仍使用固定字号。新增下载页的小屏布局已检查，但不能代替系统字体缩放验收。
- 未完成真机 TalkBack 全流程遍历、不同封面与夜间亮度下的逐项对比度测量，也未证明所有手机都能稳定达到 60fps。
- 安装调试 APK 并执行模拟器原生下载的组合命令被自动审批拒绝，返回 blocked by policy；该端到端检查未执行。原生下载类已通过 Java 编译，任务解析与UI逻辑另有自动化检查。
- 公网音源性能依赖实际启用音源和网络。本轮测试证明备用源不再串行等待首选源超时，不代表每首歌都能在固定时间播放。

## 验证

148 项单元测试（包括限量并行取源、直链与请求头传递）、TypeScript、Android Java 编译、嵌入 API 音频流/取消请求检查、移动界面桥接模拟和歌词交互自动化。最终构建与发布状态另见 GitHub Actions。
