# Clean Feed

还我一个干净的信息流。

Clean Feed 是一个跨视频网站的信息流净化浏览器扩展。v1 支持 YouTube 和 Bilibili，使用两层并发过滤：

- 程序化规则：由 AI 根据用户的一段描述生成，立即模糊屏蔽词和短时长视频。
- LLM 后置判断：页面先显示，后台用标题、频道和时长判断内容质量，低质量内容回来后再模糊。

被过滤的视频不会从信息流里消失，而是整块卡片高斯模糊；鼠标悬停或键盘聚焦时会恢复原内容。

Clean Feed 默认使用 OpenRouter：

- API Base：`https://openrouter.ai/api/v1`
- Model：`anthropic/claude-haiku-4.5`

平台反馈默认自动开启：对已经被 Clean Feed 过滤的卡片，自动尝试点击“不感兴趣”，帮助推荐算法减少同类内容。同一视频在当前页面只会尝试一次。

用户不需要手动编辑规则，只需要描述想屏蔽的内容，然后查看 AI 生成的配置。

## 安装

### Chrome / Edge / Brave 开发者模式安装

1. 进入项目目录并构建：

```bash
cd /Users/harry/Projects/clean-feed
pnpm install
pnpm run build
```

2. 打开扩展管理页：
   - Chrome：`chrome://extensions`
   - Edge：`edge://extensions`
   - Brave：`brave://extensions`
3. 打开“开发者模式”。
4. 选择“加载已解压的扩展程序”。
5. 选择这个目录：

```text
/Users/harry/Projects/clean-feed/release/clean-feed
```

不要选择 `dist/`。`dist/` 只包含编译后的 JavaScript，没有 `manifest.json`，浏览器会报 “Manifest file is missing or unreadable”。

### 生产分发包

构建后使用 `release/clean-feed` 作为完整可安装扩展目录，根目录包含 `manifest.json`。

如果要分发 zip，从 `release/clean-feed` 目录内部打包，保证 zip 根目录就是 `manifest.json`：

```bash
cd /Users/harry/Projects/clean-feed/release/clean-feed
zip -r /Users/harry/Projects/clean-feed.zip .
```

## 使用

1. 打开扩展设置页。
2. 点击“AI 连接”，填入 OpenRouter API Key。
3. 用自然语言描述想屏蔽的内容。
4. 点击“生成净化方案”。
5. 可选展开“查看当前方案”，检查生成的快速规则和 LLM 判断策略。

API Key 存在 `chrome.storage.local`，不会进入浏览器同步存储。

## 开发

```bash
pnpm install
pnpm run test
pnpm run build
```

源码在 `src/`，编译产物在 `dist/`，可直接安装的扩展目录在 `release/clean-feed/`。

## License

MIT
