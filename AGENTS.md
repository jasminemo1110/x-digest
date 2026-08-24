# X Digest 项目约定

## 产品边界

- X Digest 是独立的 Chrome Manifest V3 扩展，不与 YouTube Digest 共用运行时。
- V1 只读取当前 `x.com` 页面已经呈现或本次页面会话中已经捕获的内容，不调用 X API，不读取登录令牌，也不后台抓取账户历史。
- AI 功能使用用户自带密钥；密钥只保存在 `chrome.storage.local`，不得写入源码、测试、日志或提交。
- 推文以 X status ID 作为稳定来源身份。无法确认 ID 时，不得把内容写入持久学习库。
- AI 返回值一律视为不可信输入：校验结构、限制长度、转义后再渲染。

## 架构边界

- `content.js`：识别当前页面推文、回复和上下文，只传递结构化页面事实。
- `background.js`：侧栏协调、设置和 AI provider 调用。
- `ai-provider.js`：隔离厂商 endpoint、模型和请求字段。
- `sidepanel.js`：学习交互、本地收藏与导出，不直接解析 X DOM。
- `settings.js`：设置默认值与兼容迁移。

## 开发与验证

- 默认分支 `main` 保持为可加载、可验证版本；不确定或大范围实验使用 `codex/` 前缀分支。
- 每个独立且已验证的逻辑改动及时提交；commit message 使用中文并说明原因。
- 精确添加文件，不使用 `git add -A`。
- 基础验证：`npm test`。
- 发布前还需在 Chrome 中 Load unpacked，验证真实 X 首页、推文详情页、Thread 和回复。

## 当前验证边界

- 自动测试不等于 X 真实页面兼容性。任何 DOM 选择器改动都需要真实页面验证。
- 功能阶段与待办以 `docs/ROADMAP.md` 为准，不在本文件维护进度历史。
