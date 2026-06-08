package com.shopmate.app.ui.components

import androidx.annotation.DrawableRes
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import coil3.compose.AsyncImage

@Composable
fun ShopMateProductImage(
    imageUrl: String?,
    @DrawableRes placeholderRes: Int,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    contentScale: ContentScale = ContentScale.Crop,
) {
    val placeholderPainter = painterResource(id = placeholderRes)

    if (imageUrl.isNullOrBlank()) {
        Image(
            painter = placeholderPainter,
            contentDescription = contentDescription,
            modifier = modifier,
            contentScale = contentScale,
        )
        return
    }

    var imageLoaded by remember(imageUrl) { mutableStateOf(false) }
    var imageFailed by remember(imageUrl) { mutableStateOf(false) }
    val imageAlpha by animateFloatAsState(
        targetValue = if (imageLoaded && !imageFailed) 1f else 0f,
        label = "shopmate-product-image-alpha",
    )

    Box(modifier = modifier) {
        AsyncImage(
            model = imageUrl,
            contentDescription = contentDescription,
            modifier = Modifier
                .matchParentSize()
                .alpha(imageAlpha),
            error = placeholderPainter,
            fallback = placeholderPainter,
            contentScale = contentScale,
            onLoading = {
                imageLoaded = false
                imageFailed = false
            },
            onSuccess = {
                imageLoaded = true
                imageFailed = false
            },
            onError = {
                imageLoaded = false
                imageFailed = true
            },
        )

        if (!imageLoaded && !imageFailed) {
            ShopMateSkeletonBlock(modifier = Modifier.matchParentSize())
        }

        if (imageFailed) {
            Image(
                painter = placeholderPainter,
                contentDescription = contentDescription,
                modifier = Modifier.matchParentSize(),
                contentScale = contentScale,
            )
        }
    }
}
