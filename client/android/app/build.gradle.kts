plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

fun String.asBuildConfigString(): String = "\"${replace("\\", "\\\\").replace("\"", "\\\"")}\""

fun gradlePropertyOrDefault(name: String, defaultValue: String): String =
    providers.gradleProperty(name).orNull?.trim()?.takeIf { it.isNotEmpty() } ?: defaultValue

fun requireHttpsApiBaseUrl(buildType: String, url: String) {
    require(url.startsWith("https://", ignoreCase = true)) {
        "$buildType SHOPMATE_API_BASE_URL must use HTTPS. Configure the matching Gradle property."
    }
}

fun requireConcreteApiBaseUrl(buildType: String, propertyName: String, url: String) {
    requireHttpsApiBaseUrl(buildType, url)
    require(!url.contains(".example.invalid", ignoreCase = true)) {
        "$buildType SHOPMATE_API_BASE_URL must be configured with $propertyName before building that variant."
    }
}

fun requestedTaskContains(fragment: String): Boolean =
    gradle.startParameter.taskNames.any { taskName ->
        taskName.contains(fragment, ignoreCase = true)
    }

fun requestedLifecyclePackageTask(): Boolean =
    gradle.startParameter.taskNames.any { taskName ->
        val normalizedTask = taskName.substringAfterLast(":")
        normalizedTask.equals("build", ignoreCase = true) ||
            normalizedTask.equals("assemble", ignoreCase = true)
    }

val defaultDebugApiBaseUrl = "http://10.0.2.2:3000/"
val defaultDemoApiBaseUrl = "https://shopmate-api.example.invalid/"
val debugApiBaseUrl = gradlePropertyOrDefault("SHOPMATE_DEBUG_API_BASE_URL", defaultDebugApiBaseUrl)
val demoApiBaseUrl = gradlePropertyOrDefault("SHOPMATE_DEMO_API_BASE_URL", defaultDemoApiBaseUrl)
val releaseApiBaseUrl = gradlePropertyOrDefault("SHOPMATE_RELEASE_API_BASE_URL", demoApiBaseUrl)

requireHttpsApiBaseUrl("demo", demoApiBaseUrl)
requireHttpsApiBaseUrl("release", releaseApiBaseUrl)

if (requestedTaskContains("demo") || requestedLifecyclePackageTask()) {
    requireConcreteApiBaseUrl("demo", "SHOPMATE_DEMO_API_BASE_URL", demoApiBaseUrl)
}

if (requestedTaskContains("release") || requestedLifecyclePackageTask()) {
    requireConcreteApiBaseUrl("release", "SHOPMATE_RELEASE_API_BASE_URL", releaseApiBaseUrl)
}

android {
    namespace = "com.shopmate.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.shopmate.app"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        debug {
            buildConfigField(
                "String",
                "SHOPMATE_API_BASE_URL",
                debugApiBaseUrl.asBuildConfigString(),
            )
        }

        release {
            isMinifyEnabled = false
            buildConfigField(
                "String",
                "SHOPMATE_API_BASE_URL",
                releaseApiBaseUrl.asBuildConfigString(),
            )
        }

        create("demo") {
            initWith(getByName("release"))
            matchingFallbacks += listOf("release")
            buildConfigField(
                "String",
                "SHOPMATE_API_BASE_URL",
                demoApiBaseUrl.asBuildConfigString(),
            )
        }
    }

    buildFeatures {
        buildConfig = true
        compose = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2026.05.00")

    implementation(composeBom)
    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.10.0")
    implementation("io.coil-kt.coil3:coil-compose:3.4.0")
    implementation("io.coil-kt.coil3:coil-network-okhttp:3.4.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:okhttp-sse:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.9.0")

    debugImplementation("androidx.compose.ui:ui-tooling")

    testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlin:kotlin-test")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.2")
}
