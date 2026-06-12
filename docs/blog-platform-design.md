# 个人博客 + 桌面编辑器改造方案

## 1. 目标

把当前项目改造成一套双端内容系统：

- `Web 端`：静态个人博客，部署到 GitHub Pages
- `Desktop 端`：本地桌面编辑器，负责写作、管理内容、构建站点、导出手写笔记
- `InkNote`：作为博客中的一个独立内容频道保留，既可展示，也可继续编辑

设计原则：

- 一份内容源，两个产物
- Web 端纯静态，无服务端依赖
- 桌面端是内容后台，不直接承担线上展示
- 原有手写笔记能力不删除，而是升级为博客中的特色模块

---

## 2. 推荐技术架构

### 2.1 目标技术栈

- `apps/web`：`Astro` 为主，必要时嵌入 `React` 组件
- `apps/desktop`：保留 `Tauri + React`
- `packages/content-schema`：内容类型、校验、slug/route 规则
- `packages/site-builder`：读取内容源，生成站点数据
- `packages/inknote-core`：保留并抽离现有手写笔记渲染/导出逻辑

### 2.2 为什么这样分

- `Astro` 更适合静态博客、SEO、GitHub Pages
- 桌面端继续用 `Tauri + React`，可以复用你现有编辑器能力
- 手写笔记需要一些交互能力，Astro 页面里可以按需挂 React island
- 所有内容规则和构建逻辑放在共享包里，避免 Web 和 Desktop 各写一套

---

## 3. 目录结构

推荐目标目录：

```text
notebook/
  apps/
    web/
      src/
        components/
        layouts/
        pages/
          index.astro
          posts/
            index.astro
            [slug].astro
          projects/
            index.astro
            [slug].astro
          inknote/
            index.astro
            [slug].astro
          tags/
            index.astro
            [slug].astro
          about.astro
          archives.astro
        styles/
      public/
      astro.config.mjs
      package.json

    desktop/
      src/
        app/
        features/
          library/
          post-editor/
          page-editor/
          project-editor/
          inknote-editor/
          publish/
        components/
        lib/
      src-tauri/
      package.json

  packages/
    content-schema/
      src/
        content-types.ts
        validators.ts
        slugs.ts
        routes.ts

    site-builder/
      src/
        load-content.ts
        build-posts.ts
        build-pages.ts
        build-inknotes.ts
        build-search-index.ts
        build-rss.ts
        build-sitemap.ts
        output/

    inknote-core/
      src/
        rendering.ts
        export.ts
        parser.ts
        templates.ts

  content/
    site/
      site.config.json
      navigation.json
      social.json

    posts/
      first-post/
        index.md
        cover.jpg
        assets/

    pages/
      about/
        index.md

    projects/
      inknote/
        index.md
        cover.png

    inknote/
      classical-notes-001/
        meta.json
        source.inknote.json
        assets/

  .workspace/
    desktop/
      drafts/
      cache/
      exports/

  scripts/
  .github/
    workflows/
      deploy-pages.yml
```

### 3.1 目录职责

- `apps/web`
  - 纯展示层
  - 不直接编辑内容
  - 只读取 `content/` 和 `packages/site-builder` 生成的数据

- `apps/desktop`
  - 内容后台
  - 编辑文章、页面、项目、手写笔记
  - 管理封面、标签、摘要、发布状态
  - 一键构建站点

- `packages/content-schema`
  - 所有内容类型统一定义
  - Web/桌面端共用

- `packages/site-builder`
  - 从 `content/` 生成 Astro 页面所需的数据
  - 生成 `rss.xml`、`sitemap.xml`、`search-index.json`

- `packages/inknote-core`
  - 从现有项目抽出来的核心能力
  - 包括排版、渲染、PNG/PDF 导出

- `content/`
  - 唯一内容源
  - Git 仓库核心资产

- `.workspace/`
  - 本地编辑器缓存，不建议提交

---

## 4. 内容数据格式

建议按内容类型拆成 4 类：

- `post`：普通博客文章
- `page`：固定页面
- `project`：项目介绍页
- `inknote`：手写笔记内容

---

## 5. 通用字段规范

所有内容类型共享这些基础字段：

```ts
type BaseContentMeta = {
  id: string;              // 全局唯一 id
  type: 'post' | 'page' | 'project' | 'inknote';
  title: string;
  slug: string;
  summary?: string;
  cover?: string;
  tags?: string[];
  createdAt: string;       // ISO 日期
  updatedAt: string;       // ISO 日期
  publishedAt?: string;    // ISO 日期
  status: 'draft' | 'published' | 'archived';
  featured?: boolean;
};
```

规则：

- `slug` 作为 URL 主键
- `status = draft` 的内容不进入公开站点
- `publishedAt` 用于排序和归档
- `id` 不依赖标题，避免改标题后路径和引用混乱

---

## 6. Markdown 类内容格式

### 6.1 文章 `post`

文件路径：

```text
content/posts/<slug>/index.md
```

格式：

```md
---
id: post_20260408_001
type: post
title: 把手写笔记桌面工具改造成个人博客后台
slug: inknote-to-blog-backoffice
summary: 从单体桌面应用演进为博客内容系统的设计记录。
cover: ./cover.jpg
tags:
  - tauri
  - astro
  - blog
createdAt: 2026-04-08T10:00:00+08:00
updatedAt: 2026-04-08T12:30:00+08:00
publishedAt: 2026-04-08T13:00:00+08:00
status: published
featured: true
toc: true
---

正文内容……
```

补充字段建议：

```ts
type PostMeta = BaseContentMeta & {
  type: 'post';
  toc?: boolean;
  series?: string;
  seriesOrder?: number;
};
```

### 6.2 固定页面 `page`

文件路径：

```text
content/pages/about/index.md
```

格式：

```md
---
id: page_about
type: page
title: 关于
slug: about
summary: 关于我和这个博客。
createdAt: 2026-04-08T10:00:00+08:00
updatedAt: 2026-04-08T10:00:00+08:00
status: published
layout: page
---

这里是关于页正文……
```

补充字段建议：

```ts
type PageMeta = BaseContentMeta & {
  type: 'page';
  layout?: 'page' | 'landing';
  showInNav?: boolean;
};
```

### 6.3 项目页 `project`

文件路径：

```text
content/projects/inknote/index.md
```

格式：

```md
---
id: project_inknote
type: project
title: InkNote
slug: inknote
summary: 一个伪手写笔记生成器与博客内容系统。
cover: ./cover.png
tags:
  - project
  - tauri
  - canvas
createdAt: 2026-04-08T10:00:00+08:00
updatedAt: 2026-04-08T10:00:00+08:00
status: published
repoUrl: https://github.com/yourname/inknote
demoUrl: https://yourname.github.io/inknote/
---

项目介绍正文……
```

补充字段建议：

```ts
type ProjectMeta = BaseContentMeta & {
  type: 'project';
  repoUrl?: string;
  demoUrl?: string;
  stack?: string[];
};
```

---

## 7. 手写笔记 `inknote` 数据格式

### 7.1 文件结构

```text
content/inknote/classical-notes-001/
  meta.json
  source.inknote.json
  assets/
    cover.png
```

### 7.2 `meta.json`

```json
{
  "id": "inknote_20260408_001",
  "type": "inknote",
  "title": "古诗文摘录其一",
  "slug": "classical-notes-001",
  "summary": "校园摘抄本风格下的古诗古文试作。",
  "cover": "./assets/cover.png",
  "tags": ["inknote", "classical", "notes"],
  "createdAt": "2026-04-08T10:00:00+08:00",
  "updatedAt": "2026-04-08T10:00:00+08:00",
  "publishedAt": "2026-04-08T10:30:00+08:00",
  "status": "published",
  "paperStyle": "school",
  "handwritingStyle": "classical",
  "entry": "source.inknote.json"
}
```

### 7.3 `source.inknote.json`

建议继续沿用你现在的项目格式，只把字段整理成稳定 schema：

```json
{
  "version": 1,
  "content": "# 赤壁赋\n## 苏轼\n正文……",
  "paperStyle": "school",
  "handwritingStyle": "classical",
  "lineLayoutRules": [
    {
      "startLine": 10,
      "endLine": 14,
      "mode": "centerLongest"
    }
  ],
  "paragraphIndent": 2,
  "linesPerPage": 20,
  "fontSize": 40,
  "charSpacing": 6,
  "seed": 3842,
  "updatedAt": "2026-04-08T10:00:00+08:00"
}
```

### 7.4 构建后的衍生文件

这些文件由 `site-builder` 或桌面编辑器导出，不建议手工维护：

```text
packages/site-builder/output/inknote/classical-notes-001/
  pages/
    1.png
    2.png
  strip.png
  document.pdf
  manifest.json
```

其中 `manifest.json` 示例：

```json
{
  "slug": "classical-notes-001",
  "title": "古诗文摘录其一",
  "pageCount": 4,
  "pages": [
    "/generated/inknote/classical-notes-001/pages/1.png",
    "/generated/inknote/classical-notes-001/pages/2.png"
  ],
  "strip": "/generated/inknote/classical-notes-001/strip.png",
  "pdf": "/generated/inknote/classical-notes-001/document.pdf"
}
```

---

## 8. 站点级配置文件

### 8.1 `content/site/site.config.json`

```json
{
  "title": "你的博客名",
  "subtitle": "写作、项目与手写笔记",
  "description": "一个结合文章、项目记录和手写笔记展示的个人博客。",
  "siteUrl": "https://yourname.github.io/your-repo/",
  "language": "zh-CN",
  "author": {
    "name": "你的名字",
    "email": "you@example.com"
  },
  "theme": {
    "accent": "#7b4a2d"
  }
}
```

### 8.2 `content/site/navigation.json`

```json
[
  { "label": "首页", "href": "/" },
  { "label": "文章", "href": "/posts" },
  { "label": "项目", "href": "/projects" },
  { "label": "手写笔记", "href": "/inknote" },
  { "label": "归档", "href": "/archives" },
  { "label": "关于", "href": "/about" }
]
```

---

## 9. Web 端页面信息架构

### 9.1 顶层导航

- 首页
- 文章
- 项目
- 手写笔记
- 归档
- 关于

### 9.2 页面树

```text
/
  最近文章
  最近手写笔记
  置顶项目

/posts
  文章列表
  标签筛选
  分页

/posts/:slug
  文章正文
  目录
  上下篇
  相关文章

/projects
  项目列表

/projects/:slug
  项目详情

/inknote
  手写笔记馆列表
  纸张/风格筛选

/inknote/:slug
  手写笔记详情
  分页图预览
  长图
  PDF 下载

/tags
  标签列表

/tags/:slug
  标签聚合页

/archives
  按年/月归档

/about
  关于页

/rss.xml
/sitemap.xml
/search-index.json
```

### 9.3 每类页面职责

#### 首页 `/`

区块建议：

- Hero：博客定位
- 最新文章 5 篇
- 最新手写笔记 4 篇
- 置顶项目 1-3 个
- 标签云

#### 文章列表 `/posts`

展示：

- 卡片列表
- 发布时间
- 摘要
- 标签
- 封面

#### 文章详情 `/posts/:slug`

展示：

- 标题
- 元信息
- 正文
- 目录
- 上下篇
- 相关文章

#### 手写笔记列表 `/inknote`

展示：

- 卡片封面
- 风格标签
- 纸张类型
- 摘要
- 时间

#### 手写笔记详情 `/inknote/:slug`

展示：

- 标题/摘要
- 风格信息
- 手写分页图
- 长图模式切换
- PDF 下载
- 返回笔记馆

这个页面是原 InkNote 项目的线上展示入口。

---

## 10. 桌面编辑器信息架构

### 10.1 模块划分

```text
桌面编辑器
  内容库
    全部
    文章
    页面
    项目
    手写笔记
    草稿
    已发布

  编辑区
    Markdown 编辑器
    InkNote 编辑器

  右侧辅助区
    预览
    元信息
    导出
    发布检查
```

### 10.2 功能页建议

- `内容库`
  - 搜索
  - 筛选
  - 新建内容
  - 删除/归档

- `文章编辑器`
  - 标题
  - slug
  - 摘要
  - 标签
  - Markdown 正文
  - 封面选择

- `InkNote 编辑器`
  - 保留现有手写笔记编辑功能
  - 增加博客元信息编辑
  - 生成封面图 / PDF / 页面图

- `构建与发布`
  - 内容校验
  - 本地预览站点
  - 构建静态站点
  - 推送 Git 仓库

---

## 11. 构建与部署流程

### 11.1 本地流程

1. 在桌面端编辑内容
2. 内容保存到 `content/`
3. `site-builder` 读取内容源并生成站点数据
4. `apps/web` 构建静态站点
5. 输出到 `apps/web/dist`

### 11.2 GitHub Pages 流程

1. push 到 `main`
2. GitHub Actions 执行：
   - 安装依赖
   - 运行 `site-builder`
   - 运行 `apps/web build`
   - 部署 `dist` 到 Pages

### 11.3 GitHub Pages 注意项

- 如果是项目页部署，站点要配置 `base`
- 所有资源路径必须兼容 Pages 子路径
- 不依赖数据库、服务端 API

---

## 12. 迁移顺序建议

### 第一阶段：内容模型落地

- 新建 `content/`
- 定义 `post/page/project/inknote` schema
- 把现有 InkNote 数据迁到 `content/inknote`

### 第二阶段：共享能力抽离

- 把现有手写渲染逻辑抽到 `packages/inknote-core`
- 新建 `packages/content-schema`

### 第三阶段：Web 端博客

- 新建 `apps/web`
- 完成首页、文章、项目、手写笔记馆
- 配好 GitHub Pages

### 第四阶段：桌面端升级

- 当前 Tauri 工程迁到 `apps/desktop`
- 增加内容库和 Markdown 编辑能力
- 增加一键构建站点

---

## 13. 当前仓库的最小可行改造路径

结合你现在的仓库，建议先做最小落地版本：

```text
notebook/
  src/              -> 暂时继续作为 desktop
  src-tauri/        -> 暂时继续作为 desktop
  site/             -> 新建 web 站点
  content/          -> 新建内容目录
  packages/
    inknote-core/   -> 后续抽离
    content-schema/ -> 后续抽离
```

等跑通后，再做正式 monorepo 化。

这能避免第一步就把整个项目拆得太碎。

---

## 14. 结论

推荐的最终形态是：

- `Web`：Astro 静态博客，GitHub Pages 部署
- `Desktop`：Tauri 本地内容后台
- `InkNote`：博客中的特色频道，同时也是桌面端的重要编辑器模块
- `content/`：唯一内容源
- `site-builder`：唯一生成通道

这套结构既保留你原项目的特色，又能把它升级成一个可长期维护的个人博客系统。
