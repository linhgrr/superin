---
title: SuperIn Backend
emoji: 🚀
colorFrom: purple
colorTo: blue
sdk: docker
app_file: Dockerfile
pinned: false
---

# SuperIn Backend

Plug-and-play SuperApp platform backend — FastAPI + Beanie + LangGraph + MongoDB.

## Apps

- **Finance** — Wallet management, transactions, budgets
- **Todo** — Tasks, projects, recurring tasks
- **Calendar** — Events, recurring patterns, conflict detection

## API

- FastAPI server on port `7860`
- Swagger docs at `/docs`
- JWT auth with access/refresh tokens

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | ✅ | MongoDB connection string |
| `JWT_SECRET` | ✅ | Secret key for JWT signing |
| `OPENAI_API_KEY` | Optional | For AI agent features |
| `HF_SPACE` | Optional | Set to `true` when deployed on HF |

## Memory Configuration

Long-term memory uses LangGraph `MongoDBStore`. By default, memory recall works without semantic vector search.

To enable semantic memory search, configure:

- `MEMORY_SEMANTIC_SEARCH_ENABLED=true`
- `MEMORY_EMBEDDING_MODEL=text-embedding-3-small`
- `MEMORY_EMBEDDING_DIMENSIONS=1536`
- `MEMORY_VECTOR_INDEX_NAME=superin_memory_index`

When enabled, the backend initializes `MongoDBStore` with a vector `index_config` so memory recall can use semantic search instead of plain filtered search.
