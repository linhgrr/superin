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
