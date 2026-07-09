# ShopMate

ShopMate is an Android-native conversational shopping assistant. It combines a Kotlin mobile app with a TypeScript backend, retrieval-augmented generation, product search, cart operations, and a mock checkout flow so users can describe what they need in natural language and receive grounded product recommendations.

## Overview

Traditional ecommerce apps usually depend on keyword search, category browsing, and manual filters. ShopMate explores a more conversational flow: the user explains a shopping need, the assistant asks follow-up questions when needed, retrieves product facts from the catalog, and returns recommendations with product cards and actionable next steps.

The project is designed as a course/demo system rather than a production marketplace. It focuses on a complete and explainable AI shopping loop:

```text
Android chat input
-> Express API
-> RAG retrieval from product documents
-> PostgreSQL product fact lookup
-> LLM-guided response generation
-> SSE streaming response
-> Android product cards, cart, and checkout interactions
```

## Key Features

- Natural-language product discovery
- Streaming AI chat responses through Server-Sent Events
- Grounded product recommendations from a structured catalog
- Product cards and detail pages in the Android app
- Multi-turn shopping context and follow-up questions
- Negative constraints such as "no alcohol" or "not in-ear"
- Product comparison responses
- Cart management through both UI actions and chat commands
- Image-search entry points and backend interpretation flow
- Mock checkout drafts and order confirmation for demo scenarios
- RAG evaluation scripts, debug traces, and tuning reports

## Tech Stack

| Layer | Technology |
| --- | --- |
| Mobile app | Android Native, Kotlin, Jetpack Compose |
| Backend | Node.js, TypeScript, Express |
| Streaming | Server-Sent Events |
| Database | PostgreSQL |
| Vector search | Qdrant |
| Testing | Vitest, Android unit tests |
| Data pipeline | Node.js scripts, JSON/JSONL artifacts |

## Repository Structure

```text
shopmate/
  client/android/       Android Kotlin + Jetpack Compose app
  server/               Node.js + TypeScript + Express backend
  data/raw/             Raw product data and local product images
  data/processed/       Catalog, RAG, vector, and evaluation artifacts
  context/              Active specs, workflow notes, and project context
  docs/                 Research notes, demo runbooks, and reports
  tools/                Local scripts and evaluation utilities
```

## Getting Started

### Backend

Install dependencies and start the Express development server:

```powershell
cd server
npm.cmd install
npm.cmd run dev
```

Common backend checks:

```powershell
cd server
npm.cmd test
npm.cmd run build
```

The backend uses port `3000` by default unless configured otherwise.

### Android App

Open the Android project in Android Studio:

```text
client/android
```

Select the `app` module and run it on an emulator or Android device.

From Windows PowerShell, the common checks are:

```powershell
cd client/android
.\gradlew.bat testDebugUnitTest
.\gradlew.bat assembleDebug
```

For device testing over the same Wi-Fi network, override the debug API base URL:

```powershell
.\gradlew.bat assembleDebug -PSHOPMATE_DEBUG_API_BASE_URL=http://<your-lan-ip>:3000/
```

Demo and release variants require public HTTPS API URLs:

```powershell
.\gradlew.bat build -PSHOPMATE_DEMO_API_BASE_URL=https://<api-domain>/ -PSHOPMATE_RELEASE_API_BASE_URL=https://<api-domain>/
```

## Environment

Backend runtime configuration is documented in `.env.example`. Do not commit real API keys, database credentials, JWT secrets, provider tokens, or Android signing material.

Typical backend configuration includes:

```text
PORT=
DATABASE_URL=
JWT_SECRET=
QDRANT_URL=
QDRANT_API_KEY=
LLM_BASE_URL=
LLM_API_KEY=
LLM_MODEL=
EMBEDDING_BASE_URL=
EMBEDDING_API_KEY=
EMBEDDING_MODEL=
```

## Data And RAG Workflow

ShopMate keeps structured product facts and vector retrieval artifacts separate:

- PostgreSQL is the source of truth for product, cart, and order facts.
- Qdrant stores vector points and lightweight retrieval metadata.
- Product cards and checkout totals must come from structured backend data, not from free-form model output.
- RAG scripts generate product documents, vector indexes, evaluation results, and debug traces under `data/processed/`.

Useful backend commands depend on the configured environment and may include catalog validation, RAG document generation, vector indexing, and retrieval baselines. See the docs and scripts under `server/`, `data/processed/`, and `docs/` for the current workflow.

## Testing

Run backend tests:

```powershell
cd server
npm.cmd test
```

Compile the backend:

```powershell
cd server
npm.cmd run build
```

Run Android unit tests:

```powershell
cd client/android
.\gradlew.bat testDebugUnitTest
```

Build the Android app:

```powershell
cd client/android
.\gradlew.bat build -PSHOPMATE_DEMO_API_BASE_URL=https://<api-domain>/ -PSHOPMATE_RELEASE_API_BASE_URL=https://<api-domain>/
```

## Documentation

Active project context lives in `context/`:

- `context/project-overview.md`
- `context/coding-standards.md`
- `context/ai-interaction.md`
- `context/current-feature.md`
- `context/spec-implementation-order.md`

Supporting reports, runbooks, and research outputs live in `docs/`.

## Current Screenshot Policy

App screenshots are intentionally omitted from this README for now because the available demo captures contain Chinese UI text. English screenshots can be added later once matching English demo assets are available.
