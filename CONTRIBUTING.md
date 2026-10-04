# 贡献指南

请先开 Issue 说明问题或要适配的接口。余额适配须提供供应商的公开接口文档、币种与额度单位、必要权限；不提交真实响应、Key 或账号配置。

1. Fork 仓库，创建主题分支。
2. 修改 lib/adapters.js 或客户端源文件；client/client.js 是随包分发的生成入口，不直接编辑。
3. 增加与实际行为有关的测试：模型切换、晚到请求、失效凭证、错误回复和金额语义。
4. 每条命令在仓库目录独立执行：

```powershell
npm run build
```

```powershell
npm run check
```

```powershell
npm test
```

涉及框架契约时，设置本机 DSH_DESKTOP_ASAR 后执行集成测试：

```powershell
npm run test:integration
```

PR 描述请写清触发条件、改变后的行为、验证结果和未验证边界。UI 修改附模拟数据的深浅主题截图；不上传真实账号画面。不要提交框架归档、日志、构建备份或自动生成的凭证文件。
