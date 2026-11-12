# 高清角色与 Live2D

v1.2.0 提供 21 套 8192×8192 纹理角色资源，覆盖 12 个常规角色和 GPT、Claude、Gemini 的型号形象。资源包含九种状态、画画姿势和连续动作，安装在 `public/models/live2d-all-characters-r1/`。若只使用画布、文字和 API 设置，可跳过 Live2D 安装。

`npm run setup:avatars` 下载 [v1.2.0 发布页](https://github.com/kirobani/ai-draw-guess/releases/tag/v1.2.0) 的三个 `avatars-v2-*.zip`，合计约 511 MiB。安装器会显示进度、校验 SHA-256，网络中断后可继续下载。已安装并校验通过的包会跳过。解压后的新版角色约占 838 MiB，下载缓存另占约 511 MiB。

## 离线安装

若命令行下载较慢或报错，在浏览器从发布页分别下载 **avatars-v2-1.zip**、**avatars-v2-2.zip**、**avatars-v2-3.zip**。三个包放在同一个目录，无需手动解压。

```powershell
npm run setup:avatars -- --archive "D:\下载\角色包"
```

macOS / Linux 可将目录写为 `"/path/to/avatar-packs"`。也可把 `--archive` 指向一个 ZIP，每次安装一个包。发布页自动生成的 `Source code (zip)` 是游戏源码，不能用作角色包。

旧版 `avatars-v1.zip` 仍可从 [旧角色发布页](https://github.com/kirobani/ai-draw-guess/releases/tag/avatars-v1) 获取。升级时会保留已安装的旧版角色。若全新安装也需要重播旧版对局，可用 `--archive "旧版 avatars-v1.zip 的路径"` 另装旧资源。新对局使用新版三个 ZIP。

若角色已经安装但仍无法显示，请检查下方的 Cubism Core 安装步骤，并重启游戏。若安装失败，反馈执行的命令与最后几行报错即可，请勿附带 API Key 或 `.local/` 内容。

## Cubism Core

Cubism Core 是 Live2D 专有运行库，不包含在本仓库或角色压缩包中。请从 [官方 Cubism SDK for Web](https://www.live2d.com/en/sdk/download/web/) 下载，阅读并接受其条款。随后：

```bash
npm run setup:avatars -- --sdk "/path/to/CubismSdkForWeb"
```

脚本只从你指定的 SDK 中复制 `Core/live2dcubismcore.min.js` 到 `public/vendor/`，不会代你接受协议或从不明镜像下载。也可手动复制该文件。安装后重启/刷新网页，访问 `/avatar.html` 检查动作。当前模型使用 Cubism 5 运行时；请使用兼容的 SDK for Web。

Cubism Framework 源码及 WebGL shaders 已附原许可。渲染器可用 `npm run build` 重建。发布自己的含 Live2D 产品时，请查阅 [官方 SDK 发行许可](https://www.live2d.com/en/sdk/license/)，其条款独立于本项目 MIT。

## 角色文件许可

本项目发布附件中的自制角色纹理与绑定数据随项目按 MIT 条款提供，许可仅覆盖作者可授权的内容。AI 辅助生成的美术不保证在所有地区具有可排他的版权；厂商名称、商标和其他第三方权利不因此转移，也不表示官方合作。

角色包不包含 Cubism Core、官方 Live2D 示例模型、个人录屏或对局数据。导出自己的素材包时，同样应按所使用组件各自的许可处理。
