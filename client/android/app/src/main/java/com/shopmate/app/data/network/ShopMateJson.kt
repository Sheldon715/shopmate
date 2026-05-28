package com.shopmate.app.data.network

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.json.Json

@OptIn(ExperimentalSerializationApi::class)
object ShopMateJson {
    val instance: Json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
    }
}
