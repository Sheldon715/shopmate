package com.shopmate.app.data.network

import java.util.concurrent.TimeUnit
import okhttp3.OkHttpClient

object ShopMateHttpClient {
    fun createJsonApiClient(): OkHttpClient = baseBuilder()
        .readTimeout(JSON_READ_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .callTimeout(JSON_CALL_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .build()

    fun createSseClient(): OkHttpClient = baseBuilder()
        .readTimeout(0, TimeUnit.SECONDS)
        .callTimeout(0, TimeUnit.SECONDS)
        .build()

    private fun baseBuilder(): OkHttpClient.Builder = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .writeTimeout(10, TimeUnit.SECONDS)

    private const val JSON_READ_TIMEOUT_SECONDS = 15L
    private const val JSON_CALL_TIMEOUT_SECONDS = 30L
}
