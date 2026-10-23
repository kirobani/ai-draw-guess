# 高清角色与 Live2D

本项目使用 11 位 Kit 角色、8192×8192 纹理、9 种表情和绘画姿势。运行文件放在 `public/models/agentkit-expressions-r3/`；其中 MiMo / MiniMax 已采用修正眼睛及眉毛的 r6 资源，文件夹名是统一运行路径。

为保持 Git 历史轻量，模型放在 [avatars-v1 发布附件](https://github.com/kirobani/ai-draw-guess/releases/tag/avatars-v1)。[直接下载 avatars-v1.zip](https://github.com/kirobani/ai-draw-guess/releases/download/avatars-v1/avatars-v1.zip)，压缩包约 350 MiB。`npm run setup:avatars` 显示下载进度、核对压缩包与每个文件的 SHA-256 后安装。下载中断会自动重试，失败后重新运行会从 `.local/downloads/` 内的断点继续；校验正确的完整缓存可以重复使用。源码仓库中的 `licenses/avatars-manifest.json` 记录全部运行文件和校验和，不包含作者机器上的绝对路径。

## 下载失败或一直没反应

1. 在浏览器打开上面的发布附件，选择 **avatars-v1.zip**。`Source code (zip)` 只是游戏源码，不包含角色。不要改名后把源码包当作角色包。
2. 下载完成后**不用手动解压**，在游戏文件夹打开终端。Windows 可以输入下面的命令，把路径替换成自己实际下载的位置：

```powershell
npm run setup:avatars -- --archive "D:\下载\avatars-v1.zip"
```

macOS / Linux 示例：

```bash
npm run setup:avatars -- --archive "/path/to/avatars-v1.zip"
```

3. 看到角色安装成功后，还要按下一节安装 **Cubism Core**。角色包与运行库是两项不同的文件。

常见情况：

| 现象 | 处理 |
| --- | --- |
| `fetch failed`、`CONNECT_TIMEOUT`、连接重置 | 先更新到新版安装脚本再重试，或使用浏览器下载后离线安装。浏览器能下载不代表 Node.js 终端使用了相同的代理设置。 |
| 浏览器也无法下载 GitHub 附件 | 更换能访问 GitHub 发布附件的网络，或由已下载成功的人转交未经修改的 `avatars-v1.zip`，再离线安装；安装器仍会校验原包。 |
| `角色包校验不通过` / `Archive checksum mismatch` | 文件未下载完整、已损坏或选错包，重新下载 `avatars-v1.zip`。不要跳过校验。 |
| `尚未安装 Cubism Core` | 按下一节安装官方 SDK 中的 Core；这不是角色包没下载成功。 |
| `找不到角色模型` | 确认安装命令在当前运行的游戏副本中执行，安装后重启服务并刷新网页。 |

仍有问题时，反馈**执行的命令与最后几行报错**，并说明是浏览器下载失败还是安装时失败。请勿附带 API Key 或 `.local/` 内容。

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
