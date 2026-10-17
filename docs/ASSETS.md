# 高清角色与 Live2D

本项目使用 11 位 Kit 角色、8192×8192 纹理、9 种表情和绘画姿势。运行文件放在 `public/models/agentkit-expressions-r3/`；其中 MiMo / MiniMax 已采用修正眼睛及眉毛的 r6 资源，文件夹名是统一运行路径。

为保持 Git 历史轻量，模型放在 [avatars-v1 发布附件](https://github.com/kirobani/ai-draw-guess/releases/tag/avatars-v1)。`npm run setup:avatars` 下载压缩包，核对压缩包与每个文件的 SHA-256 后安装。源码仓库中的 `licenses/avatars-manifest.json` 记录全部运行文件和校验和，不包含作者机器上的绝对路径。

下载受限时可手动下载，然后运行：

```bash
npm run setup:avatars -- --archive "/path/to/avatars-v1.zip"
```

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
