# Backend Data Model Specification

This document captures the detailed Django ORM schema planned for Phase 2.

## apps.factoids

### Factoid
- `id`: `UUIDField`, primary key, default `uuid.uuid4`
- `text`: `TextField`
- `subject`: `CharField(max_length=255, blank=True)`
- `emoji`: `CharField(max_length=16, blank=True)`
- `created_at`: `DateTimeField(auto_now_add=True)`
- `updated_at`: `DateTimeField(auto_now=True)`
- `votes_up`: `PositiveIntegerField(default=0)`
- `votes_down`: `PositiveIntegerField(default=0)`
- `generation_metadata`: `JSONField(default=dict, blank=True)`
- `created_by`: `ForeignKey` → `GenerationRequest` (nullable, `SET_NULL`)
- `cost_usd`: `DecimalField(max_digits=7, decimal_places=4, null=True, blank=True)`
- Indexes: `created_at`, `subject`, `votes_up - votes_down`

### GenerationRequest
- `id`: `UUIDField`, PK
- `client_hash`: `CharField(max_length=128)`
- `api_key`: `ForeignKey` → `APIKey` (nullable, `SET_NULL`)
- `request_source`: `CharField(choices=RequestSource, max_length=16)`
- `model_key`: `CharField(max_length=255)`
- `parameters`: `JSONField(default=dict)`
- `status`: `CharField(choices=RequestStatus, max_length=16, default="pending")`
- `expected_cost_usd`: `DecimalField(max_digits=7, decimal_places=4, null=True, blank=True)`
- `actual_cost_usd`: `DecimalField(max_digits=7, decimal_places=4, null=True, blank=True)`
- `token_usage_prompt`: `IntegerField(null=True, blank=True)`
- `token_usage_completion`: `IntegerField(null=True, blank=True)`
- `started_at`: `DateTimeField(null=True, blank=True)`
- `completed_at`: `DateTimeField(null=True, blank=True)`
- `error_message`: `TextField(blank=True)`
- `retry_of`: `ForeignKey` self-reference (nullable, `SET_NULL`)
- Indexes: `client_hash`, `status`, `created_at`
- `created_at`: `DateTimeField(auto_now_add=True)`

### VoteAggregate
- `id`: `BigAutoField`
- `factoid`: `ForeignKey` → `Factoid`
- `client_hash`: `CharField(max_length=128)`
- `vote_type`: `CharField(choices=("up", "down"), max_length=8)`
- `created_at`: `DateTimeField(auto_now_add=True)`
- Unique constraint on (`factoid`, `client_hash`)

### FactoidFeedback
- `id`: `BigAutoField`
- `factoid`: `ForeignKey` → `Factoid`
- `generation_request`: `ForeignKey` → `GenerationRequest` (nullable, `SET_NULL`)
- `vote`: `CharField(max_length=8, blank=True)`
- `client_hash`: `CharField(max_length=128, blank=True)`
- `comments`: `TextField(blank=True)`
- `tags`: `ArrayField(CharField(max_length=64))` (Postgres only; fallback JSON for SQLite)
- `created_at`: `DateTimeField(auto_now_add=True)`

### ModelCache
- `id`: `SmallAutoField`, single row
- `models`: `JSONField(default=list)`
- `fetched_at`: `DateTimeField(auto_now=True)`
- `expires_at`: `DateTimeField(null=True, blank=True)`

## apps.core

### APIKey
- `id`: `UUIDField`, PK
- `name`: `CharField(max_length=64)`
- `hashed_key`: `CharField(max_length=128)`
- `is_active`: `BooleanField(default=True)`
- `rate_limit_profile`: `CharField(max_length=32, default="default")`
- `metadata`: `JSONField(default=dict, blank=True)`
- `created_at`: `DateTimeField(auto_now_add=True)`
- `last_used_at`: `DateTimeField(null=True, blank=True)`
- Unique constraint on `name`

### ClientSession
- `id`: `UUIDField`, PK
- `session_token`: `CharField(max_length=64, unique=True)`
- `client_hash`: `CharField(max_length=128)`
- `issued_at`: `DateTimeField(auto_now_add=True)`
- `expires_at`: `DateTimeField()`
- `metadata`: `JSONField(default=dict, blank=True)`

### RateLimitSnapshot
- `id`: `BigAutoField`
- `bucket`: `CharField(max_length=128)`
- `window_start`: `DateTimeField`
- `window_end`: `DateTimeField`
- `count`: `IntegerField()`
- `budget_remaining`: `IntegerField(null=True, blank=True)`
- `metadata`: `JSONField(default=dict, blank=True)`
- Unique constraint on (`bucket`, `window_start`, `window_end`)

## apps.payments

### PaymentSession
- `id`: `UUIDField`, PK
- `stripe_session_id`: `CharField(max_length=255, unique=True)`
- `status`: `CharField(choices=PaymentStatus, max_length=32, default="created")`
- `client_hash`: `CharField(max_length=128, blank=True)`
- `requested_generation`: `ForeignKey` → `GenerationRequest` (nullable, `SET_NULL`)
- `amount`: `DecimalField(max_digits=7, decimal_places=2)`
- `currency`: `CharField(max_length=16, default="usd")`
- `metadata`: `JSONField(default=dict, blank=True)`
- `created_at`: `DateTimeField(auto_now_add=True)`
- `updated_at`: `DateTimeField(auto_now=True)`
- Index `status`

## apps.analytics

### EvaluationArtifact
- `id`: `UUIDField`, PK
- `source_type`: `CharField(choices=ArtifactSource, max_length=32)`
- `payload`: `JSONField()`
- `score`: `DecimalField(max_digits=4, decimal_places=3, null=True, blank=True)`
- `created_at`: `DateTimeField(auto_now_add=True)`
- `evaluated_at`: `DateTimeField(null=True, blank=True)`

## apps.chat

### ChatSession
- `id`: `UUIDField`, PK
- `client_hash`: `CharField(max_length=128, blank=True)`
- `api_key`: `ForeignKey` → `APIKey` (nullable, `SET_NULL`)
- `status`: `CharField(choices=ChatSessionStatus, max_length=16, default="active")`
- `system_prompt`: `TextField(blank=True)`
- `config`: `JSONField(default=dict, blank=True)`
- `model_key`: `CharField(max_length=255)`
- `token_budget_remaining`: `IntegerField(default=0)`
- `total_tokens_used`: `IntegerField(default=0)`
- `cost_usd`: `DecimalField(max_digits=7, decimal_places=4, null=True, blank=True)`
- `created_at`: `DateTimeField(auto_now_add=True)`
- `last_activity_at`: `DateTimeField(auto_now=True)`

### ChatMessage
- `id`: `BigAutoField`
- `session`: `ForeignKey` → `ChatSession`
- `role`: `CharField(choices=ChatMessageRole, max_length=16)`
- `content`: `JSONField()`
- `metadata`: `JSONField(default=dict, blank=True)`
- `token_usage`: `IntegerField(null=True, blank=True)`
- `cost_usd`: `DecimalField(max_digits=7, decimal_places=4, null=True, blank=True)`
- `created_at`: `DateTimeField(auto_now_add=True)`

### ChatToolCall (future extension)
- `id`: `BigAutoField`
- `message`: `ForeignKey` → `ChatMessage`
- `tool_name`: `CharField(max_length=64)`
- `arguments`: `JSONField()`
- `result`: `JSONField(null=True, blank=True)`
- `created_at`: `DateTimeField(auto_now_add=True)`

---

These definitions will drive the Phase 2 migrations and admin setups. JSON fields default to empty dict/list to keep serialization predictable. Decimal fields cover approximate token spend tracking in USD (4 decimal places).
