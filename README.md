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
  client/android/       Android Kotlin + Jetpack Compose 客户端
  server/               Node.js + TypeScript + Express 后端
  data/raw/             原始脱敏商品数据与本地图片素材
  data/processed/       结构化 catalog 与 RAG / vector 生成工件
  context/              当前 active specs、工作流与项目上下文
  docs/                 部署、APK 演示与运行手册
```

## 运行方式

### Android 客户端

使用 Android Studio 打开以下目录：

```text
client/android
```

选择 `app` 模块，在模拟器或 Android 真机上运行。

也可以在 Windows PowerShell 中执行：

```powershell
cd client/android
.\gradlew.bat testDebugUnitTest
.\gradlew.bat assembleDebug
```

真机同 Wi-Fi 调试时可通过 Gradle property 覆盖 debug API 地址：

```powershell
.\gradlew.bat assembleDebug -PSHOPMATE_DEBUG_API_BASE_URL=http://<电脑局域网IP>:3000/
```

打包 demo / release 变体时必须显式提供公网 HTTPS API 地址，避免生成不可联网的 APK：

```powershell
.\gradlew.bat build -PSHOPMATE_DEMO_API_BASE_URL=https://<云端API域名>/ -PSHOPMATE_RELEASE_API_BASE_URL=https://<云端API域名>/
```

### 后端服务

在仓库根目录执行：

```powershell
cd server
npm.cmd install
npm.cmd run dev
```

常用检查命令：

```powershell
npm.cmd test
npm.cmd run build
```

后端默认使用 `3000` 端口。
