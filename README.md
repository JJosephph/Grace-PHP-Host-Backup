# 恩典 PHP 主机一键备份

![恩典 PHP 主机一键备份 Logo](assets/logo-512.png)

一个面向 PHP 主机和传统虚拟主机的 Windows 图形化 FTP 备份迁移工具。

它不依赖 SSH、不压缩整站，也不需要服务器安装额外程序。配置 FTP 后即可直接下载或上传整站目录，适合 Typecho、WordPress、ThinkPHP 等常见 PHP 项目。

## v0.2.0 变化

- v0.2.2 提高深色界面对比度和默认字号，改善笔记本缩放后的可读性。
- 增加开源免费、GitHub Star 和开发者联系方式。
- 桌面界面使用 Electron、React、TypeScript 和 Vite 重写。
- 使用 shadcn/ui Nova 风格、Lucide 图标和 Motion 动效统一设计语言。
- 扫描阶段实时显示目录数、文件数、当前路径和耗时。
- 传输阶段实时显示当前文件、文件序号、逐字节进度、速度、剩余时间和失败数。
- 新增远端文件浏览器，可查看远端目录、文件大小和修改时间。
- 支持暂停、继续、取消和失败重试。
- 自动迁移 v0.1 的旧配置与 Windows 加密密码。

## 核心特性

- FTP / FTPS 直连，不压缩文件，避免超大压缩包中途失败。
- 支持一键下载备份、上传迁移和连接测试。
- 自动创建目录结构，保留相对路径。
- 默认按文件大小跳过未变化文件，可选比较修改时间。
- 下载中断后保留 `.part` 文件，下次尽量续传。
- 上传时若远端文件较小，会尝试从断点继续。
- 支持维护 FTP 主机、端口、账号、密码、远端目录和排除规则。
- 密码使用 Electron 系统安全存储加密保存。
- 默认不删除远端文件，也不删除本地已有文件。
- 支持排除缓存目录，例如 `var/cache`、`var/tmp`、`.git`。

## 下载使用

前往 Releases 下载：

`Grace-PHP-Host-Backup-0.2.2-portable.exe`

这是便携版 Windows 程序，不需要安装。第一次运行后填写 FTP 信息即可。

## 使用步骤

1. 打开“连接设置”，填写主机、端口、用户名、密码和默认远端目录。
2. 点击“保存设置”，再点击“测试连接”确认连接正常。
3. 打开“一键备份”，选择本地备份目录。
4. 点击“开始备份”。
5. 如果需要迁移到另一台主机，先完整下载备份，再在“上传迁移”中选择同一目录上传。

## 默认排除

默认排除以下路径，避免备份运行时缓存：

```text
.git
var/cache
var/tmp
sql_backup/static_backup_work
```

排除规则可以在软件中修改，支持 `*` 和 `?` 通配符。

## 安全设计

- 不压缩、不打包，失败时不会留下损坏的整站压缩包。
- 下载先写入 `.part` 文件，完整后再替换目标文件。
- 不上传、不读取除配置目录和用户选择目录以外的本地内容。
- 不内置任何 FTP 密码或私有服务器凭据。
- 默认不会删除远端多余文件。

## 从源码运行

环境要求：

- Windows 10 / 11
- Node.js 22+

```powershell
npm install
npm run dev
```

## 构建 EXE

```powershell
powershell -ExecutionPolicy Bypass -File .\build.ps1
```

构建结果位于：

```text
release\Grace-PHP-Host-Backup-0.2.2-portable.exe
release\恩典PHP主机一键备份.exe
```

旧版 Python 源码 `app.py` 保留用于历史参考，不再参与构建。

## 版本

当前版本：`v0.2.2`

## 作者

WangYufan (JJosephph)

邮箱：yufan14710@gmail.com

QQ：1471056247

## 开源支持

本项目开源免费。如果它帮你节省了时间，欢迎到 GitHub 点个 Star：

<https://github.com/JJosephph/Grace-PHP-Host-Backup>

## License

MIT
