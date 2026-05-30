# Android Runtime Config

## 概述

为 Phase 3.5 建立 Android 演示环境配置：让同一套 App 能清楚区分模拟器本地开发、真机同 Wi-Fi 调试、最终答辩 demo 和后续 release 构建。

本 spec 的核心不是重新做网络层，而是把已经存在的 `ShopMateApiConfig`、`BuildConfig.SHOPMATE_API_BASE_URL` 和 manifest 网络权限整理成可演示、可切换、不会把 `localhost` 写死到 UI 的配置方案。

推荐路线：

- `debug`：模拟器本地开发，默认 `http://10.0.2.2:3000/`。
- debug override：真机同 Wi-Fi 调试，通过 Gradle property 覆盖为电脑局域网 IP。
- `demo`：最终课程演示 APK，指向公网 HTTPS API。
- `release`：后续正式构建，默认也只接受 HTTPS API。

## 范围

本 spec 负责：

- 拆清 Android 的 debug / local Wi-Fi / demo / release Base URL。
- 保留 `ShopMateApiConfig` 作为唯一 URL 解析入口。
- 让 debug 可以用 Gradle property 覆盖 Base URL。
- 增加 `demo` 构建配置，用于最终答辩 APK。
- 把 cleartext HTTP 限定到 debug / local Wi-Fi，不再全局长期允许。
- 确认 App name、launcher icon、APK 输出路径和真机安装步骤。
- 保留 Preview / mock fallback，不让 UI 开发依赖后端在线。

不负责：

- 后端云部署。
- 静态商品图片 serving。
- Android 远程图片加载。
- 真实 API key、LLM key、数据库 URL 或 Qdrant key 配置。
- Google Play 上架、签名发布、应用商店合规。
- 修改 Chat SSE / Product / Cart 业务逻辑。

## 前置条件

先完成：

- `android-network-client-spec.md`
- `android-chat-api-integration-spec.md`
- `android-product-api-integration-spec.md`
- `android-cart-api-foundation-spec.md`
- `deployment-readiness-research.md`

当前项目应已有：

- `client/android/app/build.gradle.kts`
- `client/android/app/src/main/AndroidManifest.xml`
- `client/android/app/src/main/java/com/shopmate/app/data/network/ShopMateApiConfig.kt`
- `client/android/app/src/main/res/values/strings.xml`
- launcher icon 资源

## 当前状态

已存在：

- `INTERNET` 权限。
- `BuildConfig.SHOPMATE_API_BASE_URL`，默认 `http://10.0.2.2:3000/`。
- `ShopMateApiConfig.resolve(path)`，集中处理 URL 校验和路径拼接。
- app name / icon 已在 manifest 中引用。

需要调整：

- `android:usesCleartextTraffic="true"` 当前在 main manifest 全局开启。
- Base URL 目前只有一个默认值，没有明确区分 debug / demo / release。
- 真机同 Wi-Fi 调试需要手动覆盖为电脑局域网 IP。
- demo 构建不能依赖 `localhost`、`10.0.2.2`、临时 tunnel URL 或本地 IP。

## 技术决策

短期采用最小扰动方案：

- 保留现有 `debug` build type。
- 新增 `demo` build type，而不是马上引入多 product flavor。
- `debug` 允许 HTTP cleartext，用于模拟器和真机同 Wi-Fi。
- `demo` / `release` 默认不允许 cleartext，只指向 HTTPS API。
- Base URL 继续写入 `BuildConfig.SHOPMATE_API_BASE_URL`。

后续如果环境更多，再把 build type 方案升级成 `local` / `wifi` / `demo` product flavors。

## Gradle 配置

修改：

- `client/android/app/build.gradle.kts`

保留：

- `buildFeatures.buildConfig = true`

Base URL 规则：

- debug 默认：
  - `http://10.0.2.2:3000/`
- debug override：
  - Gradle property：`SHOPMATE_DEBUG_API_BASE_URL`
  - 用途：真机同 Wi-Fi，例如 `http://192.168.1.23:3000/`
- demo：
  - Gradle property：`SHOPMATE_DEMO_API_BASE_URL`
  - 用途：最终答辩 APK，例如 `https://shopmate-api.example.com/`
- release：
  - Gradle property：`SHOPMATE_RELEASE_API_BASE_URL`
  - 默认可复用 demo URL，但必须是 HTTPS。

实现要求：

- 不把局域网 IP、tunnel URL 或公网 URL 写进 Kotlin UI / repository 文件。
- 不把真实 token、provider key 或数据库 URL 写进 `BuildConfig`。
- 如果尚未有真实云端 HTTPS URL，`demo` 可以暂时使用非敏感 placeholder，例如 `https://shopmate-api.example.invalid/`，但必须在文档中标明 demo smoke test 需要等 `backend-deployment-readiness-spec.md` 完成后再跑。
- `ShopMateApiConfig` 继续校验 URL scheme 必须是 `http` 或 `https`。
- `demo` / `release` 的配置不得默认使用 `http://10.0.2.2:3000/`。

建议增加一个小 helper，避免 Gradle 字符串转义散落：

```kotlin
fun String.asBuildConfigString(): String = "\"${replace("\\", "\\\\").replace("\"", "\\\"")}\""
```

## Cleartext 策略

修改：

- `client/android/app/src/main/AndroidManifest.xml`
- 新增或调整 debug manifest overlay：
  - `client/android/app/src/debug/AndroidManifest.xml`

要求：

- main manifest 移除全局 `android:usesCleartextTraffic="true"`。
- debug overlay 允许 cleartext HTTP。
- demo / release 不默认允许 cleartext HTTP。
- 如果实现时需要 network security config，放在 debug source set，不要让 demo / release 继承。

debug overlay 示例意图：

```xml
<application android:usesCleartextTraffic="true" />
```

不要为了让 demo 访问 HTTP tunnel 而打开 release cleartext。临时 tunnel 也应优先使用 HTTPS，并在 runbook 中单独说明。

## ShopMateApiConfig

检查并按需补强：

- `client/android/app/src/main/java/com/shopmate/app/data/network/ShopMateApiConfig.kt`

要求：

- `baseUrl` 仍从 `BuildConfig.SHOPMATE_API_BASE_URL` 读取。
- `resolve(path)` 继续处理末尾 `/` 和开头 `/`。
- 空字符串、非法 URL、非 HTTP/HTTPS URL 返回稳定错误。
- 不在 `resolve` 中打印 Base URL。
- 不记录真实公网 URL 以外的敏感配置；Base URL 本身不应包含 key。

可选补充：

- 增加测试覆盖：
  - 默认 URL 能 resolve `api/chat/stream`。
  - 末尾 slash 和 path 开头 slash 不生成双 slash。
  - 非法 scheme 抛 `InvalidBaseUrl`。

## App Name / Icon / APK

确认：

- `client/android/app/src/main/res/values/strings.xml`
  - `app_name` 是最终展示名，例如 `ShopMate`。
- `AndroidManifest.xml`
  - `android:label="@string/app_name"`。
  - `android:icon` 和 `android:roundIcon` 指向稳定 launcher icon。

不要在本 spec 里重新设计图标。如果当前 icon 已能在桌面显示 ShopMate 标识，只需要确认和记录。

APK 输出记录：

- debug：
  - 命令：`cd client/android && .\gradlew.bat assembleDebug`
  - 预期 APK：`client/android/app/build/outputs/apk/debug/app-debug.apk`
- demo：
  - 命令：`cd client/android && .\gradlew.bat assembleDemo`
  - 预期 APK：按实际 Gradle 输出记录到 runbook。

如果 Gradle task 名因实现方式不同而变化，以实际 `.\gradlew.bat tasks --group build` 输出为准，并在后续 `apk-demo-runbook-spec.md` 中记录。

## 文件

预计修改：

- `client/android/app/build.gradle.kts`
- `client/android/app/src/main/AndroidManifest.xml`
- `client/android/app/src/main/java/com/shopmate/app/data/network/ShopMateApiConfig.kt`（如需补测试友好的 helper）

预计新增：

- `client/android/app/src/debug/AndroidManifest.xml`
- `client/android/app/src/test/java/com/shopmate/app/data/network/ShopMateApiConfigTest.kt`（如当前测试结构允许）

不修改：

- Chat SSE client。
- Product API client。
- Cart API client。
- Compose 业务 UI。
- 后端代码。
- `.env` 真实内容。

## 运行与验证

必须运行：

```powershell
cd client/android
.\gradlew.bat build
```

如果 Android build 因环境 JDK / Gradle worker 问题失败，记录失败原因，不要伪造通过。

建议验证：

```powershell
cd client/android
.\gradlew.bat assembleDebug
.\gradlew.bat assembleDemo
```

debug 真机同 Wi-Fi 覆盖示例：

```powershell
cd client/android
.\gradlew.bat assembleDebug -PSHOPMATE_DEBUG_API_BASE_URL=http://192.168.1.23:3000/
```

注意：

- 上面的 IP 是示例，实现或文档中不要把它当成固定值。
- demo HTTPS URL 如果还没有真实部署地址，先不要声称 demo smoke test 已通过。

## 完成标准

- Android build 通过，或明确记录无法运行的环境原因。
- debug 默认仍可用于模拟器访问本机后端。
- debug 可通过 Gradle property 指向电脑局域网 IP。
- demo / release 不默认指向 `localhost`、`10.0.2.2`、局域网 IP 或临时 tunnel。
- main manifest 不再全局长期允许 cleartext HTTP。
- mock / Preview 不受后端离线影响。
- app name 和 icon 在 manifest 中配置清楚。
- 没有真实 API key、数据库 URL、Qdrant key、JWT secret 或 `.env` 内容进入 Android 代码和文档。
