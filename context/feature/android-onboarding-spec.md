# Android Onboarding Screen

## Overview

Reproduce the Figma welcome / onboarding screen in Jetpack Compose. This is the first screen users see before entering the main ShopMate chat entry page.

Figma reference:

- File: `shopmate`
- Frame node: `3:103`
- Frame size: about `389 x 843`

## Requirements

- Replace the placeholder `Text("ShopMate")` screen with an onboarding screen.
- Match the Figma layout: status bar area, mascot hero, headline, supporting text, large CTA button, and bottom value points.
- Use the real Shopmate Buddy mascot from the Figma asset, not a placeholder drawing.
- Main title text:
  - First line: `你好， 我是你的`
  - Highlight line: `AI 导购助手`
- Supporting text: `告诉我你想买什么，我来帮你筛选和对比`
- CTA text: `开始购物`
- Bottom value points:
  - `懂你所需`
  - `帮你筛选`
  - `陪你挑选`
- CTA click can be a no-op for this spec unless the app shell/navigation spec already exists.

## Visual Notes

- Background is white / very light gray-green with a soft mint glow near the mascot.
- Primary green: close to `#31C88C`.
- CTA uses a rounded pill shape, green gradient, and soft shadow.
- Text color should stay close to the Figma dark navy / charcoal tone.
- Mascot sits above the headline and should keep its approximate proportions.
- Keep the layout usable on similar Android phone sizes; avoid absolute pixel-only positioning where Compose responsive layout is enough.

## Files

Expected Android files:

- `client/android/app/src/main/java/com/shopmate/app/MainActivity.kt`
- `client/android/app/src/main/java/com/shopmate/app/ui/onboarding/OnboardingScreen.kt`
- `client/android/app/src/main/res/drawable-nodpi/mascot_assistant.webp`

If small icons are exported from Figma, place them under:

- `client/android/app/src/main/res/drawable/`

## Asset Handling

- Download/export the mascot from the Figma MCP asset for frame `3:103`.
- Store it as `mascot_assistant.webp`.
- Do not reference the temporary Figma MCP asset URL directly from app code.
- Bottom value icons can be simple vector drawables if the Figma icon export is not necessary.

## Acceptance Criteria

- App launches into the onboarding screen.
- Screen visually matches the Figma welcome frame at a glance.
- Mascot, headline, supporting text, CTA, and bottom value points are present.
- Text does not overlap or overflow on the target phone frame.
- `cd client/android && .\gradlew.bat build` passes.
