# ShopMate

ShopMate 是一个面向电商场景的对话式购物助手项目，采用 Android 客户端与 AI 后端协同的方式，让用户能够通过自然语言描述需求，完成商品探索、推荐理解、对比筛选和购物决策。

## 项目简介

传统电商应用通常依赖关键词搜索、分类浏览和手动筛选。ShopMate 希望提供一种更自然的购物体验：用户通过对话表达需求，系统根据上下文逐步理解用户意图，并返回更贴近需求的商品结果与解释。

## 核心能力

- 自然语言商品发现
- 对话式推荐与追问
- 条件补充与结果收敛
- 商品对比与推荐理由生成
- 面向购物车场景的交互设计
- 基于检索增强生成的推荐架构

## 技术架构

ShopMate 采用前后端分离架构：

- Android Native 客户端
- Kotlin
- Jetpack Compose
- Node.js
- TypeScript
- Express
- PostgreSQL
- Qdrant

## 项目结构

```text
shopmate/
  client/android/
  server/
  context/
```

## 运行方式

### Android 客户端

使用 Android Studio 打开以下目录：

```text
client/android
```

选择 `app` 模块，在模拟器或 Android 真机上运行。

### 后端服务

进入 `server/` 目录后执行：

```bash
npm install
npm run dev
```

构建命令：

```bash
npm run build
```

后端默认使用 `3000` 端口。
