# InkNote

InkNote 是一个面向个人写作的本地编辑器 + 静态博客系统。它的核心思路是：内容在本地桌面端统一管理，前端博客以静态页面形式发布到 GitHub Pages 或其他静态托管平台。

桌面端负责写作、分类、标签、图片、评论配置、统计配置、站点发布和版本更新；Web 端负责展示文章列表、文章详情、归档、搜索、InkNote 手写笔记、评论区和阅读统计。

## 功能概览

- Tauri + React 桌面编辑器，用于日常写作和站点管理。
- React 静态博客前端，可部署到 GitHub Pages。
- 两种正式内容类型：`markdown` 和 `inknote`。
- Markdown 预览支持 KaTeX 公式、代码块、原始 HTML、图片、PDF slides 嵌入。
- InkNote 支持手写笔记本风格渲染，可在博客端展示分页笔记。
- 本地内容统一存放在 `content/`，桌面端可发布到远程部署仓库。
- 支持类目、标签、友链、常用工具、图库、评论系统、阅读统计等站点设置。
- 评论系统支持 Giscus。
- 阅读统计支持 GoatCounter。
- 桌面端支持 GitHub Release 发布和 Tauri updater 自动更新元数据。

## 目录结构

```text
apps/
  desktop/          Tauri 桌面编辑器
  web/              静态博客前端
content/
  markdown/         Markdown 文章和页面
  inknotes/         InkNote 条目和手写笔记工程
  site/             站点配置、导航、类目配置
packages/
  content-schema/   内容模型和站点配置类型
  inknote-core/     InkNote 渲染与工程数据工具
  site-builder/     Markdown/frontmatter 解析工具
scripts/            发布、图库、构建等辅助脚本
docs/               设计与发布说明
```

## 内容模型

InkNote 目前只保留两种一等内容类型。

### Markdown

普通博客文章、技术笔记和静态页面都属于 `markdown`：

```text
content/markdown/<slug>/index.md
```

其中 `<slug>` 由编辑器生成和管理，不建议手动修改。

### InkNote

InkNote 是“博客内容条目 + 手写笔记工程”的组合：

```text
content/inknotes/<slug>/index.md
content/inknotes/<slug>/notebook.inknote.json
```

`index.md` 保存标题、标签、发布时间、发布状态等博客元数据；`notebook.inknote.json` 保存手写笔记工程数据。

发布站点时，桌面端会把本地内容打包成 `inknote-content.json`。部署分支不需要直接保存完整的原始 `content/` 目录。

## 环境准备

安装依赖：

```powershell
npm.cmd install
```

启动 Web 前端：

```powershell
npm.cmd run web:dev
```

启动桌面端前端：

```powershell
npm.cmd run desktop:dev
```

启动 Tauri 桌面壳：

```powershell
npm.cmd run desktop:tauri:dev
```

构建 Web 前端：

```powershell
npm.cmd run web:build
```

构建桌面端前端：

```powershell
npm.cmd run desktop:build
```

构建全部前端：

```powershell
npm.cmd run build
```

## 桌面编辑器

桌面编辑器是主要工作入口，支持：

- 类目管理、英文名配置和顺序调整。
- 新建 Markdown / InkNote 笔记。
- Markdown 编辑、预览、公式、代码块、图片和 slides。
- InkNote 编辑，并在右侧使用手写笔记本风格预览。
- 编辑标题、标签、发布状态和创建日期。
- 粘贴图片自动保存到本地资源并插入引用。
- 外部图片本地化，内部图片和外部图片分组管理。
- 图库批量上传、分页、删除、批量删除和文章配图重新分配。
- 友链和常用工具管理。
- 站点设置、评论设置、阅读统计设置和发布设置。
- 从远端部署仓库拉取内容，并选择远端优先或本地优先处理冲突。

## Web 博客

Web 端是静态 SPA，主要页面包括：

- 类目文章列表。
- 文章详情页。
- InkNote 手写笔记详情页。
- 归档页。
- 搜索页。
- 文章目录。
- 标签云。
- 友链和常用工具。
- Giscus 评论区。
- GoatCounter 阅读统计。

GitHub Pages 项目站点的基础路径会根据发布仓库自动推导，不需要手动维护。

## 发布站点

在桌面编辑器的设置页中配置部署仓库和分支，然后点击右上角“发布”。

发布流程大致如下：

1. 保存当前文章和站点设置。
2. 在源码工作区运行时自动重建 Web 壳。
3. 将 `content/` 打包为 `inknote-content.json`。
4. 复制图片、图库、slides、生成文件等公共资源。
5. 将静态产物提交到配置的部署分支。
6. 推送到配置的远程仓库。

部署分支可以直接作为 GitHub Pages 的发布源。

更多细节见 [docs/publishing.md](docs/publishing.md)。

## 拉取远端内容

如果更换电脑或本地内容落后于远端，可以在桌面编辑器中执行“拉取”。

拉取时会合并可兼容的文件；遇到同一路径冲突时，可以选择：

- 远端优先：冲突内容以远端为准。
- 本地优先：冲突内容保留本地版本。

这不是完整的多人协同编辑系统，更接近个人多设备同步。

## 评论与统计

评论系统使用 Giscus。需要在设置中配置：

- GitHub 仓库。
- Discussion 分类。
- repo id。
- category id。

阅读统计使用 GoatCounter。站点会加载 GoatCounter 脚本进行访问统计。

注意：GitHub Pages 上直接从浏览器读取 GoatCounter counter API 容易遇到 CORS 限制。如果要长期稳定展示阅读量，后续更适合通过定时任务生成同源统计快照。

## 图片与图库

图片管理分为三类：

- 外链引用：文章中引用的外部图片。
- 本地存储：已经保存到项目资源中的图片。
- 图库：用于文章卡片配图的本地图片库。

图库会尽量为文章分配不重复配图；如果图库数量不足，未匹配的文章会留空。删除图库图片后，引用它的文章会在重新分配时更新配图。

上传图库图片时会先压缩裁剪，用于博客卡片展示，不保留原图级别的体积。

## 桌面端版本发布

桌面端版本号由脚本统一更新：

```powershell
npm.cmd run desktop:version -- patch
```

也可以使用：

```powershell
npm.cmd run desktop:version -- minor
npm.cmd run desktop:version -- major
npm.cmd run desktop:version -- 0.2.0
```

默认情况下，该脚本会：

1. 更新桌面端相关版本文件。
2. 创建提交。
3. 创建版本标签。
4. 将当前分支和标签推送到 `origin`。

GitHub Actions 会根据标签构建 Windows 安装包和 Tauri updater 元数据。

如果只想改版本文件而不执行 Git 操作：

```powershell
npm.cmd run desktop:version -- patch --no-git
```

如果只想检查将要发生什么：

```powershell
npm.cmd run desktop:version -- patch --dry-run
```

## 自动更新

桌面端会优先使用 Tauri 官方 updater：

```text
https://github.com/Chty-syq/InkNote/releases/latest/download/latest.json
```

如果 updater 没有返回可安装包，但 GitHub Release 中存在 Windows 安装包，编辑器会降级为“下载安装”流程：自动下载 release 里的 `.exe` 并启动安装器。

Tauri updater 签名需要 GitHub Secrets：

- `TAURI_UPDATER_PUBKEY`
- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

私钥必须是 `tauri signer generate` 输出的 base64 私钥内容，不要包含标签、引号、代码块、空格或换行，并保留末尾的 `=` 填充字符。

## 常用命令

```powershell
npm.cmd run web:dev
npm.cmd run web:build
npm.cmd run desktop:dev
npm.cmd run desktop:build
npm.cmd run desktop:tauri:dev
npm.cmd run desktop:version -- patch
```

## 仓库体积维护

Rust 和前端构建会生成较大的临时目录，通常不应该提交：

```text
apps/desktop/src-tauri/target/
apps/desktop/dist/
apps/web/dist/
node_modules/
```

如果本地体积异常，可以先关闭编辑器、构建进程和杀毒扫描占用，再删除这些目录。

如果大文件已经进入 Git 历史，需要使用 `git-filter-repo` 或类似工具重写历史；这会影响所有协作者的本地仓库，需要谨慎执行。

## 说明

- 这是一个个人写作系统，不是通用 CMS。
- `content/` 是本地内容仓的核心来源。
- 部署分支保存的是静态发布产物，不等同于源码分支。
- 如果修改了 Web 前端源码，需要重新构建 Web 壳；桌面端发布流程在源码工作区中会自动处理这一点。
