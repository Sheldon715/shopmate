# 当前功能：初始化前后端技术栈骨架

## 状态

已完成

## 目标

- 初始化 `client/android/` Android 原生 Kotlin 工程骨架，优先支持后续 UI 开发。
- 初始化 `server/` 下的 Node.js + TypeScript + Express 后端骨架。
- 补齐前后端基础目录结构与启动入口。
- 补充当前阶段最小启动说明，并明确是否需要 `.env`。
- 保持 Phase 1 范围内只做语言与工程初始化，不接入 PostgreSQL、Qdrant 和业务数据流。

## 待办事项

- [x] 明确当前 Phase 1 初始化范围并与文档对齐
- [x] 初始化 Node.js + TypeScript + Express 后端工程
- [x] 初始化 Android Kotlin UI 工程骨架
- [x] 补齐基础目录结构与占位文件
- [x] 说明当前阶段无需 `.env`，并补充最小启动说明
- [x] 运行当前阶段可执行的构建或检查命令
- [x] 更新 README 或相关文档说明初始化结果

## 备注

- 当前阶段优先服务于 UI 开发，因此 Android 端以可继续扩展页面的基础工程为目标。
- 数据库、Qdrant、Embedding、LLM、SSE 真实链路暂不接入，只保留后续扩展所需的结构位置。
- 后端目前只保留最小可运行 Express 服务，不保留额外示例模块。
- Android 端优先采用 Jetpack Compose 作为默认 UI 路线。
- 当前后端不依赖 `.env` 文件，端口未配置时默认使用 `3000`。
- 后端 `npm run build` 已通过；Android Gradle wrapper 已生成，`gradlew.bat assembleDebug` 已通过，可继续在模拟器或真机中查看界面。

## 历史记录

- 待补充
