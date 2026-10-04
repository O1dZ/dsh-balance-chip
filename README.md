# dsh-balance-chip

简体中文 | [English](README.en.md)

[![CI](https://github.com/O1dZ/dsh-balance-chip/actions/workflows/ci.yml/badge.svg)](https://github.com/O1dZ/dsh-balance-chip/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

DeepSeek Harness 输入框工具栏的供应商余额圆环。悬停看余额，点击看详情；跟随当前会话的模型选择，切换模型立即刷新，每 60 秒更新一次。

## 界面预览

深色主题：

![深色主题详情（模拟余额）](preview/dsh-balance-chip-preview.png)

浅色主题：

![浅色主题详情（模拟余额）](preview/dsh-balance-chip-light.png)

两张截图均来自模拟测试页面，金额不是实际账号余额。

## 功能

- 普通持久插件包：使用 bundle patch 在启动时加载，重启无需重新创建动态脚本。
- 显示当前供应商 / 模型、接口返回的余额明细、更新时间及手动刷新按钮。
- 圆环、悬浮提示和实色详情面板跟随深浅主题；Esc 或点击外部关闭。
- 模型切换后清除上一选择；晚到的查询不会覆盖新的供应商。刷新失败保留同一供应商的上次余额并标明过期。
- 金额、币种与原始额度分开显示；缺少凭证、权限不足、超时、不支持和异常回复不当作零余额。

## 兼容性与支持范围

面向 Harness **0.2.0-rc.2** 的公开服务契约，使用当前 SettingsForms.describe、modelDirectories 与 Typert codec 工厂。Windows 桌面版本已进行框架回归与模拟 UI 验证；其他 Harness 版本及操作系统尚未验证。开发需要 Node.js 22.14+。

| 类型 | 查询内容 |
| --- | --- |
| DeepSeek API（含自定义路由名） | 总余额、充值余额、赠金，各币种分别显示 |
| DeepSeek Account | 复用 Harness 账号余额接口和登录状态 |
| Moonshot 中国 / 国际 | 可用余额、现金、代金券，CNY / USD |
| SiliconFlow 中国 / 国际 | 总余额、充值、赠金 |
| OpenRouter | API Key 剩余额度；账户总余额接口需管理密钥 |
| 自定义兼容网关 | 尝试 DeepSeek 余额格式、One API / New API 用户额度、旧 dashboard billing 格式 |

自动使用所选供应商的已启用配置，不需要再次输入 Key。没有通用余额发现协议；未适配的接口不会自动得到支持。普通 OpenAI、Anthropic、Google 模型密钥及 OAuth 订阅配额未适配。New API / One API 的 quota 保留原始额度单位，不猜测货币换算。

CNY 圆环以 ¥50、USD 以 $10 为显示参考，**不代表账户额度上限**。不统计或伪造今日消费、Token 费用或请求数。

## 安装

本项目尚未发布到 npm。使用源码包安装到已有 Harness profile；下面以 Windows 的 desktop profile 为例。若使用其他 profile，请替换命令中的 profile 路径。需要 Git 和 pnpm，并先关闭 Harness。

1. 在任意工作目录克隆仓库：

```powershell
git clone https://github.com/O1dZ/dsh-balance-chip.git
```

2. 保持在克隆命令所在的目录，将包加入现有 profile（不执行依赖安装脚本）：

```powershell
pnpm --dir "$env:USERPROFILE\.dsh\profiles\desktop" add --ignore-scripts ("file:" + (Resolve-Path '.\dsh-balance-chip').Path.Replace('\', '/'))
```

3. 在该 profile 的 package.json 中，将 **dsh-balance-chip** 追加到已有的 **dsh.profile.bundles** 数组；保留所有原有 bundle。包内 cordis.patch.yml 会插入插件实例。
4. 完整启动 Harness，打开会话并选择已配置的供应商模型。首次安装或更新宿主代码后必须完整重启，网页刷新无法替换进程中已加载的模块。

该安装方式引用本地源码目录，请保留该目录。使用其他安装方式时，需要同时保留包的宿主入口、客户端入口、./typert 导出与 bundle patch。

## 更新与卸载

在仓库目录更新代码：

```powershell
git pull --ff-only
```

更新后重新执行安装步骤 2，并完整重启 Harness。卸载时先关闭 Harness，从 profile 的 dsh.profile.bundles 数组移除该包，再移除依赖：

```powershell
pnpm --dir "$env:USERPROFILE\.dsh\profiles\desktop" remove --ignore-scripts dsh-balance-chip
```

## 开发与验证

开发脚本只使用 Node.js 内置模块，不需要安装开发依赖；peer dependencies 由 Harness 提供。在仓库目录分别执行：

```powershell
npm run check
```

```powershell
npm test
```

```powershell
npm run build
```

- check 检查 JavaScript 语法、客户端生成文件一致性和常见私密信息；自动扫描不能替代人工检查。
- npm test 执行 11 项可移植单元测试，覆盖适配器、错误分类、币种、模型切换与请求竞态。
- 框架集成测试另有 10 项，需要你自己安装的 Harness app.asar；不会上传或分发该归档。设置 DSH_DESKTOP_ASAR 为本机实际文件的绝对路径后运行：

```powershell
npm run test:integration
```

集成测试提取已安装框架到临时目录并在结束后清理；使用模拟账号与余额，不读取真实凭证。覆盖真实 Cordis、Registry/Gateway、SettingsForms、实时密钥引用更新。YAML 迁移、表达式插值及网络传输边界打桩。

浏览器验证打开 tests/render-test.html，浅色主题追加 ?light。页面通过 esm.sh 加载 React，使用模拟余额，不连接账号；深浅主题均检查实色背景、portal、供应商切换、刷新和关闭交互。截图中的金额均为模拟值。

CI 在 Windows 上运行语法 / 隐私检查、可移植测试、重建一致性及 npm 打包清单检查。真实余额与安装后的宿主加载需在自己的 Harness 环境验证。

## 安全与隐私

余额请求只在宿主侧执行，通过已有受信任 Typert 通道返回整理后的金额。Key 从 Harness 凭证服务解析，端点、凭证值和原始错误文本不进入客户端。请求只使用 GET，同源且禁止重定向；非本机明文 HTTP 不查询。

请勿在 Issue、PR、截图或日志中提交 Key、会话 Cookie、OAuth token、真实 profile 或账号信息。漏洞报告参见 [SECURITY.md](SECURITY.md)。

## 贡献与许可证

欢迎适配新的公开余额接口。请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)，遵守 [行为准则](CODE_OF_CONDUCT.md)。项目采用 [MIT](LICENSE) 许可证。

圆环交互参考 [EdwinZDZ/dsh-api-balance-ring](https://github.com/EdwinZDZ/dsh-api-balance-ring)，供应商目录与适配思路参考 [sumomok/dsh-plugins](https://github.com/sumomok/dsh-plugins/tree/main/packages/balance)。本项目保留独立实现，不分发 Harness 框架代码或真实配置。第三方依赖的权利和许可属于各自作者。
