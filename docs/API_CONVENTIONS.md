# API Conventions

> **Áp dụng cho:** Mọi FastAPI route trong `backend/apps/` và `backend/core/`
> **Mục tiêu:** REST endpoint nhất quán, predictable, dễ debug.

---

## 1. URL Naming

### 1.1 Pattern

```
/api/{entity}
/api/{entity}/{id}
/api/{entity}/{id}/{sub}
/api/{app_id}/...
```

| URL | Method | Mô tả |
|-----|--------|-------|
| `GET /api/apps/catalog` | list all | App catalog |
| `POST /api/apps/install` | action | Install app |
| `GET /api/apps/{appId}/widgets` | list | Widget list |
| `GET /api/apps/{appId}/preferences` | get user's | Widget prefs |
| `PUT /api/apps/{appId}/preferences` | replace | Update prefs |
| `GET /api/apps/finance/wallets` | list | Finance wallets |
| `POST /api/apps/finance/transactions` | create | Add transaction |

### 1.2 Rules

- **Lowercase, hyphen-separated**: `/api/chat/stream` (not `/api/chatStream`)
- **No verbs in URL**: `/api/transactions` (not `/api/getTransactions`)
- **Singular cho resource**: `/api/wallet` (not `/api/wallets`)
- **Plural cho list**: `/api/wallets` (list all wallets)
- **Nested resources**: `/api/wallets/{walletId}/transactions`

---

## 2. Request & Response

### 2.1 Standard response envelope

```python
# Success — trả trực tiếp data (FastAPI tự wrap)
@router.get("/wallets")
async def list_wallets() -> list[WalletSchema]:
    return wallets  # auto 200 + JSON

# Error — dùng HTTPException
@router.get("/wallets/{wallet_id}")
async def get_wallet(wallet_id: str, user_id=Depends(get_current_user)):
    wallet = await Wallet.find_one(Wallet.user_id == user_id, Wallet.id == wallet_id)
    if not wallet:
        raise HTTPException(404, "Wallet not found")
    return wallet
```

### 2.2 Pydantic response model

```python
from pydantic import BaseModel

class WalletResponse(BaseModel):
    id: str
    name: str
    balance: float
    currency: str

class WalletListResponse(BaseModel):
    items: list[WalletResponse]
    total: int

@router.get("/wallets", response_model=WalletListResponse)
async def list_wallets(user_id=Depends(get_current_user)):
    wallets = await Wallet.find(Wallet.user_id == user_id).to_list()
    return WalletListResponse(
        items=[WalletResponse.model_validate(w) for w in wallets],
        total=len(wallets),
    )
```

### 2.3 Pagination

```python
@router.get("/transactions")
async def list_transactions(
    user_id: str = Depends(get_current_user),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, le=100),
) -> list[dict]:
    txs = (
        Transaction.find(Transaction.user_id == user_id)
        .sort("-date")
        .skip(skip)
        .limit(limit)
        .to_list()
    )
    return [_tx_to_dict(t) for t in txs]
```

Query params: `?skip=0&limit=20`

---

## 3. Error Handling

### 3.1 HTTP Status Codes

| Status | Dùng khi |
|--------|-----------|
| `200 OK` | Success |
| `201 Created` | Resource created |
| `204 No Content` | Delete success |
| `400 Bad Request` | Invalid input |
| `401 Unauthorized` | Missing/invalid token |
| `403 Forbidden` | Valid token nhưng không có quyền |
| `404 Not Found` | Resource không tồn tại |
| `422 Unprocessable Entity` | Pydantic validation failed |
| `429 Too Many Requests` | Rate limit exceeded |
| `500 Internal Server Error` | Server error |

### 3.2 Error body format

```python
# Dùng HTTPException — format tự động của FastAPI
raise HTTPException(404, "Wallet not found")
# → {"detail": "Wallet not found"}

# Hoặc response_model cho custom format
class ErrorResponse(BaseModel):
    error: str
    code: str
    details: dict | None = None

raise HTTPException(
    status_code=400,
    detail={"error": "Insufficient balance", "code": "INSUFFICIENT_FUNDS"}
)
```

---

## 4. Auth Header

### 4.1 Required auth

```python
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    ...

@router.get("/wallets", dependencies=[Depends(get_current_user)])
async def list_wallets(user_id: str = Depends(get_current_user)):
    ...
```

### 4.2 Optional auth

```python
async def optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(
        HTTPBearer(auto_error=False)
    ),
) -> str | None:
    if credentials:
        return await get_current_user(credentials)
    return None

@router.get("/apps/catalog")
async def list_apps(user_id: str | None = Depends(optional_user)):
    apps = get_all_plugins()
    if user_id:
        installed = await get_installed_apps(user_id)
        return enrich_with_install_status(apps, installed)
    return apps
```

---

## 5. App Plugin Routes

### 5.1 Route prefix tự động

```python
# backend/core/main.py — auto-mount plugin routers
for app_id, plugin in PLUGIN_REGISTRY.items():
    app.include_router(
        plugin.router,
        prefix=f"/api/apps/{app_id}",
        tags=[app_id],
    )
```

Plugin chỉ cần define routes không có prefix:

```python
# backend/apps/finance/routes.py

router = APIRouter()  # KHÔNG có prefix

@router.get("/widgets")         # → /api/apps/finance/widgets
@router.get("/wallets")        # → /api/apps/finance/wallets
@router.post("/transactions")   # → /api/apps/finance/transactions
@router.get("/preferences")    # → /api/apps/finance/preferences (core catalog route)
```

### 5.2 App routes phải có

```python
# BẮT BUỘC — core platform gọi
@router.get("/widgets")
async def list_widgets():
    from .manifest import finance_manifest
    return finance_manifest.widgets

# BẮT BUỘC — core platform gọi
@router.get("/preferences")
async def get_preferences(user_id=Depends(get_current_user)):
    prefs = await WidgetPreference.find(
        WidgetPreference.user_id == user_id
    ).to_list()
    return prefs

@router.put("/preferences")
async def update_preferences(
    updates: list[PreferenceUpdate],
    user_id=Depends(get_current_user),
):
    ...
```

---

## 6. SSE Streaming

### 6.1 Chat stream endpoint

```python
from assistant_stream import create_run
from assistant_stream.serialization import DataStreamResponse

@router.post("/stream")
async def chat_stream(request: Request, user_id=Depends(get_current_user)):
    body = await request.json()

    async def run(controller):
        async for event in root_agent.astream(user_id, body["messages"]):
            if event["type"] == "text":
                controller.append_text(event["content"])
            elif event["type"] == "tool_call":
                controller.add_tool_call(event["toolName"], event["toolCallId"], event["args"])
            elif event["type"] == "tool_result":
                controller.add_tool_result(event["toolCallId"], event["result"])
            elif event["type"] == "done":
                controller.complete()

    return DataStreamResponse(create_run(run, state={"messages": body["messages"]}))
```

### 6.2 SSE event types

```
event: text
data: {"type":"text","content":"Hello"}

event: tool_call
data: {"type":"tool_call","toolName":"finance_add_transaction","toolCallId":"tc_001","args":{...}}

event: tool_result
data: {"type":"tool_result","toolCallId":"tc_001","result":{"success":true}}

event: done
data: {"type":"done"}
```

---

## 7. Service Layer (cho apps phức tạp)

Finance app có business logic phức tạp → dùng service layer.

```
backend/apps/finance/
├── routes.py
├── service.py     ← Business logic (CRUD + validation)
└── repository.py  ← Data access (Beanie queries)
```

```python
# backend/apps/finance/service.py

class WalletService:
    async def create_wallet(self, user_id: str, data: CreateWallet) -> Wallet:
        existing = await Wallet.find_one(Wallet.user_id == user_id, Wallet.name == data.name)
        if existing:
            raise HTTPException(400, "Wallet with this name already exists")
        wallet = Wallet(user_id=user_id, name=data.name, balance=0.0, currency=data.currency)
        await wallet.insert()
        return wallet

    async def transfer(self, user_id: str, data: TransferRequest) -> Transaction:
        # Validate wallets + balance
        src = await Wallet.find_one(Wallet.id == data.from_wallet_id, Wallet.user_id == user_id)
        dst = await Wallet.find_one(Wallet.id == data.to_wallet_id)
        if not src or src.balance < data.amount:
            raise HTTPException(400, "Insufficient balance")
        # ... atomic transaction
        return tx

wallet_service = WalletService()

# backend/apps/finance/routes.py — routes gọi service
@router.post("/wallets")
async def create_wallet(
    data: CreateWallet,
    user_id=Depends(get_current_user),
) -> WalletResponse:
    wallet = await wallet_service.create_wallet(user_id, data)
    return WalletResponse.model_validate(wallet)
```

> **Quy tắc:** Routes = thin layer (validate input → call service → return response). Business logic trong service. Data access trong repository.

---

## 8. Global Exception Handler + Logging

### 8.1 Wire exception handlers vào main.py

```python
# backend/core/main.py
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse({"error": exc.detail}, status_code=exc.status_code)

@app.exception_handler(RequestValidationError)
async def validation_handler(request, exc):
    return JSONResponse(
        {"error": "Validation failed", "details": exc.errors()},
        status_code=422,
    )

@app.exception_handler(Exception)
async def generic_handler(request, exc):
    import logging
    logging.exception("Unhandled exception")
    return JSONResponse({"error": "Internal server error"}, status_code=500)
```

### 8.2 Request logging middleware

```python
# backend/core/logging_middleware.py
import time, logging

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - start) * 1000
    logging.info(
        f"{request.method} {request.url.path} → {response.status_code} ({duration_ms:.1f}ms)"
    )
    return response
```

---

## 9. Password Hashing Utilities

```python
# backend/core/security.py

from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password: str) -> str:
    """Hash password — dùng bcrypt."""
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    """Verify plain password against hash."""
    return pwd_context.verify(plain, hashed)
```

---

## 10. Testing Fixtures

### 10.1 conftest.py

```python
# backend/tests/conftest.py

import pytest, asyncio
from httpx import AsyncClient, ASGITransport
from beanie import init_beanie, Document
from motor.motor_asyncio import AsyncIOMotorClient

# Pytest asyncio config
pytest_plugins = ("pytest_asyncio",)

# ── Fixture: Test DB (in-memory / separate DB) ─────────────────────────────
@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()

@pytest.fixture
async def test_db():
    client = AsyncIOMotorClient("mongodb://localhost:27017", uuidRepresentation="standard")
    db = client["superin_test"]
    await init_beanie(db, document_models=[User, Wallet, Transaction])
    yield db
    # Cleanup
    await db.drop_collection("users")
    await db.drop_collection("wallets")
    await db.drop_collection("transactions")
    client.close()

# ── Fixture: Authenticated test client ─────────────────────────────────────
@pytest.fixture
async def client(test_db):
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

@pytest.fixture
async def auth_client(client: AsyncClient):
    # Register + login → lấy token
    await client.post("/api/auth/register", json={"email": "test@test.com", "password": "testpass", "name": "Test"})
    resp = await client.post("/api/auth/login", json={"email": "test@test.com", "password": "testpass"})
    token = resp.json()["access_token"]
    client.headers["Authorization"] = f"Bearer {token}"
    return client
```

### 10.2 Test ví dụ

```python
# backend/tests/apps/test_finance.py

@pytest.mark.asyncio
async def test_create_wallet(auth_client):
    resp = await auth_client.post(
        "/api/apps/finance/wallets",
        json={"name": "Main Wallet", "currency": "USD"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Main Wallet"
    assert data["balance"] == 0.0

@pytest.mark.asyncio
async def test_insufficient_balance(auth_client):
    resp = await auth_client.post(
        "/api/apps/finance/transfer",
        json={"from": "w1", "to": "w2", "amount": 999999},
    )
    assert resp.status_code == 400
    assert "Insufficient balance" in resp.json()["detail"]
```

---

## 11. Versioning

Không dùng `/v1/` prefix. API version implicit trong backend version.

```python
# FastAPI app title
app = FastAPI(title="Shin SuperApp", version="2.1.0")

# Schema versioning — thêm field, không remove
# Nếu break: tạo schema mới (WalletV2Schema) hoặc tăng major version
```
