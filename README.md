# AI 你画我猜 · AI Draw & Guess

把 11 家 AI 请到同一张画桌：你画它们猜、它们画你猜，也可以一起玩画画接龙。角色有各自的性格、高清 Live2D 表情和赛后互怼。

**本地运行 · 自带 API Key · 默认 OpenRouter · 中文界面**

## 快速开始

需要 **Node.js 22.9 或更新版**（推荐 24 LTS）及 npm。Windows、macOS、Linux 均可运行。

```bash
git clone https://github.com/kirobani/ai-draw-guess.git
cd ai-draw-guess
npm ci
npm run setup:avatars
npm start
```

打开 **http://127.0.0.1:3211**，进入 **AI 设置 → 统一 OpenRouter Key**，保存自己的 Key。然后选择选手与型号，点「保存并验证看图 / 绘图」；验证成功后开局。

**Live2D 还有一次安装步骤：**高清角色由 `setup:avatars` 下载（约 350 MiB 压缩包，解压约 389 MiB），现在会显示下载进度、自动重试，中断后再次运行可继续下载。下载失败可用浏览器下载 [avatars-v1.zip](https://github.com/kirobani/ai-draw-guess/releases/download/avatars-v1/avatars-v1.zip)，再按 [离线安装步骤](docs/ASSETS.md#下载失败或一直没反应) 安装；不要下载成 `Source code.zip`。

Cubism Core 由使用者从 [Live2D 官方 SDK for Web](https://www.live2d.com/en/sdk/download/web/) 下载并接受其许可后安装：

```bash
npm run setup:avatars -- --sdk "你的 Cubism SDK for Web 解压目录"
```

脚本寻找该目录下的 `Core/live2dcubismcore.min.js`。源码库不包含此专有运行库；没装好角色时，游戏逻辑与 API 设置仍可运行。离线安装、版本与许可见 [角色资源说明](docs/ASSETS.md)。

也可复制 `.env.example` 为 `.env`，填写 `OPENROUTER_API_KEY`；网页中单独为某位选手填写的 Key 优先。默认仅 GPT 勾选参赛，可按需要勾选其余角色，避免首次操作就同时调用所有模型。

## 更新已有安装

用 Git 克隆的项目可在游戏文件夹执行：

```bash
git pull --ff-only
npm ci
npm run setup:avatars
npm start
```

请先结束并按需导出正在进行的比赛，再关闭旧服务、更新和重启。已安装且校验正确的角色不会重复下载；`.local/` 中的个人设置和 `.env` 不属于 Git 跟踪内容。用源码 ZIP 安装的用户可下载新版源码，并参照 [更新记录](CHANGELOG.md) 核对功能。

## 玩法

- **单挑 / 多人赛**：最多 11 位 AI 与 1 位玩家围坐画布，画手顺序随机；分数、猜词过程、聊天气泡和历史消息持续可见。
- **画画接龙**：每人拥有一条随机传递链，交替画图与猜词，最后逐棒展示、投票与互相甩锅。首尾词完全相同时自动通过。
- **题库三档**：成语入门 218、进阶 2,000、挑战 29,508 条；其他分类也有三档，入门不少于 200 条。挑战不是所有历史成语的穷尽清单。
- **提示三种**：完全禁用、指定画面提示、自然读图提醒。提醒针对画面内容与误读，不应解释答案含义；模型可能不完全遵从。
- **九种角色反应**：待机、画画、画完等待、自信、犹豫、瞎蒙、庆祝、吃瓜、猜错。把握值来自同一次模型回答，没有额外表情请求。
- **每题互怼**：画手、猜中和没猜中的人互相点名，被点名的玩家可以打字回应或跳过。玩家也能主动选一位 AI 开麦，对方必须回应；失败可重试，关闭自动互怼也能使用。普通局揭晓后和接龙投票结束后都可用。
- **复盘与视频素材**：导出绘图笔画、猜词、时间线、分数、聊天和角色反应，可在素材页重播与重新构图；不会自动剪成成片。

## 模型和接口

所有角色默认独立调用对应厂商的 OpenRouter 型号，**包括 GPT**，不是同一个模型换角色扮演。型号目录来自 [OpenRouter Models API](https://openrouter.ai/api/v1/models)，可按厂商选择、手动输入 ID，并查看请求型号与平台返回的型号回执。

| 角色 | 默认 OpenRouter 型号 |
| --- | --- |
| GPT | `openai/gpt-6.1-sol` |
| Claude | `anthropic/claude-sonnet-5.5` |
| Gemini | `google/gemini-4-argon` |
| DeepSeek | `deepseek/deepseek-v4.1-flash` |
| Grok | `x-ai/grok-4.7` |
| GLM | `z-ai/glm-5.3-flashx` |
| Kimi | `moonshotai/kimi-k3` |
| 千问 | `qwen/qwen3.8-flash` |
| 豆包 | `bytedance-seed/seed-2.0-lite` |
| MiMo | `xiaomi/mimo-v2.6-pro` |
| MiniMax | `minimax/minimax-m3` |

默认值核对日期：2026-10-17。可用性、价格和地区限制随平台变化；目录支持不等于账户已有权限，也不保证模型每次都能返回有效笔画。每个选手都有独立接口地址、Key、型号、思考强度与超时设置，详见 [API 配置](docs/API.md)。

**识图**需要图片输入；**画图**是模型生成简笔画 JSON，由游戏绘制，不需要额外的原生图片生成接口。模型的身份和 Live2D 角色可分别选择。GPT 可选本机 Codex CLI，但默认不依赖它，也不会读取其他项目的密钥。

## 开发

```bash
npm test                 # 规则、接口、安全边界与导出检查；未安装角色时跳过资源专项测试
npm run build            # 从 TypeScript 重新构建角色渲染器
npm run test:assets      # 安装完整角色和 Core 后，强制验证模型与运行库
```

主要目录：`lib/` 服务端规则和模型适配，`public/` 浏览器界面，`src/` 角色驱动，`data/` 词库和目录快照，`tests/` 自动测试。没有数据库服务；设置与本地对局保存在 `.local/`。

默认只监听回环地址。本项目是个人本地游戏，尚未实现公网账户、多用户权限或租户隔离，不要直接用反向代理开放成公共服务。API 会把本轮题目、画面和对话发送给你选择的模型平台；调用由你自己的账户计费。密钥以本机文件或环境变量保存，不会返回给网页；不要分享 `.local/` 或 `.env`。

## 许可与致谢

原创游戏代码按 [MIT](LICENSE) 发布；项目提供的角色模型、美术和第三方组件范围见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。Live2D Cubism Framework、Cubism Core、霞鹜文楷字体、Agent Kit 和词库各自保留原有条款，不能把它们统称为 MIT。

角色是非官方拟人形象，本项目与各模型厂商、OpenRouter、Live2D 无隶属或背书关系。模型名称及图中商标归其权利人。欢迎提交 Issue 和 Pull Request；请不要上传 API Key、个人对局或录屏。
