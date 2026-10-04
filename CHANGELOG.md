# 变更记录

## 1.1.0 — 2026-10-05

首次公开版本。

- 持久安装的供应商余额圆环，悬停查看余额、点击查看明细。
- 自动跟随当前会话的模型 / 供应商，60 秒刷新及手动刷新。
- DeepSeek API / Account、Moonshot、SiliconFlow、OpenRouter 及已知兼容网关适配。
- 对接当前 Harness SettingsForms.describe 与严格 Typert codec，修复自定义 DeepSeek Key 读取失败。
- 深浅主题实色面板，避免底层文字透出；portal 避免输入框裁剪。
- 失败状态、旧值标记、刷新去重、模型切换竞态与卸载清理。
- 11 项可移植单元测试、10 项本机框架集成测试与模拟浏览器验证。
