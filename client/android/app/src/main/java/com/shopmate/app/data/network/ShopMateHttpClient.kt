package com.shopmate.app.data.network

import java.util.concurrent.TimeUnit
import okhttp3.OkHttpClient

object ShopMateHttpClient {
    fun create(): OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        // SSE is a long-lived response, so the first shared client keeps read timeout disabled.
        .readTimeout(0, TimeUnit.SECONDS)
        .writeTimeout(10, TimeUnit.SECONDS)
        .build()
}
