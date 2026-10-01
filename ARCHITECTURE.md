# Santo AI Agent - Architecture

Production-grade omnichannel AI orchestrator architecture.

## System Overview

```
User Message (WhatsApp/Email/Web/SMS)
           ↓
    [Webhook Handler]
           ↓
    [Channel Adapter] - Normalize to AgentInput
           ↓
    [Orchestrator - 16 Steps]
         1. Normalize input
         2. Intent detection (LLM + regex fallback)
         3. Entity extraction
         4. Context loading (from database)
         5. Knowledge retrieval (RAG + embeddings)
         6. Rules evaluation (guardrails)
         7. Tool selection (CRM, scheduling, etc.)
         8. Confidence check (threshold enforcement)
         9. Escalation decision
        10. Tool execution (parallel when possible)
        11. Response generation (LLM)
        12. Validation (guards + rules)
        13. Tracing (decision path logging)
        14. Persistence (save to database)
        15. Channel adaptation (format for platform)
        16. Send response
           ↓
    [Channel Adapter] - Format & send
           ↓
    Response delivered (WhatsApp/Email/Web/SMS)
```

## Component Architecture

### Orchestrator (Core)

The 16-step orchestrator manages the entire message pipeline:

**Input**: AgentInput (user message + metadata)
**Output**: AgentResponse (AI response + metadata)

```typescript
class OrchestratorAgent {
  async process(input: AgentInput): Promise<AgentResponse>
  getTrace(traceId: string): Trace
}
```

### Adapters (Channels)

Convert between platform-specific formats and AgentInput/AgentResponse:

- **WhatsAppAdapter** - Meta Cloud API
- **EmailAdapter** - SendGrid, AWS SES, SMTP
- **WebWidgetAdapter** - HTTP/WebSocket for web chat
- **SMSAdapter** - Twilio or similar
- **Extensible** - Create custom adapters

### Tools (Actions)

Executable functions for business operations:

**Knowledge Management**
- `knowledgeRetrievalTool` - RAG search + embeddings

**CRM**
- `crmCreateContactTool` - Create/update customer
- `crmScoreLeadTool` - Calculate lead quality
- `crmLogInteractionTool` - Log conversation

**Scheduling**
- `schedulingCheckAvailabilityTool` - Get free slots
- `schedulingBookAppointmentTool` - Create booking
- `schedulingCancelAppointmentTool` - Cancel/reschedule

**Notifications**
- `emailSendTool` - Send email
- `notificationScheduleFollowupTool` - Queue follow-up

**E-commerce**
- `inventoryCheckStockTool` - Check product availability
- `orderCreateTool` - Create order

Tools have permission levels:
- `auto` - Execute immediately
- `confirm` - Ask user first
- `approval` - Manager approves
- `human` - Escalate to human

### Guards (Validation)

Response validation ensures AI never:
- Invents prices/policies
- Makes false commitments
- Reveals PII or API keys
- Exceeds length limits
- Uses inappropriate language
- Fails to escalate when needed

```typescript
validateResponse(response: string, trace: Trace): GuardResult
quarantineIfInvalid(response: string, trace: Trace): ApprovalResult
```

## Data Flow

### Message Ingestion

```
Webhook Payload
     ↓
[Verify Signature] - Security
     ↓
[Parse Format] - Extract message, sender, timestamp
     ↓
[Normalize] - Standardize to AgentInput
     ↓
[Deduplicate] - Check idempotency by provider ID
     ↓
[Enqueue] - Add to processing queue (database)
```

### Processing Pipeline

```
AgentInput
   ↓
Step 1: Normalize
   - Trim whitespace
   - Convert to lowercase (for analysis)
   - Limit to 4000 chars
   ↓
Step 2: Intent Detection
   - Call Claude API with intent prompt
   - Fallback: regex pattern matching
   - Confidence 0-1, default 0.5-0.9
   ↓
Step 3: Entity Extraction
   - Pull structured data (name, email, date, product)
   - Store in trace.entities
   ↓
Step 4-5: Context & Knowledge
   - Load conversation history from database
   - Load customer profile (score, status, history)
   - Retrieve relevant knowledge base documents (top 3)
   ↓
Step 6: Rule Evaluation
   - Apply custom business rules
   - Mark triggered rules in trace
   ↓
Step 7-9: Tool Selection & Escalation
   - Select applicable tools based on intent
   - Check confidence threshold
   - If low confidence or escalation intent: flag for human
   ↓
Step 10: Tool Execution
   - Execute selected tools (CRM, scheduling, etc.)
   - Collect results
   ↓
Step 11: Response Generation
   - LLM generates human-like response
   - Based on: intent, knowledge, tool results, rules
   - Max 2000 chars
   ↓
Step 12: Validation
   - Run guardrails
   - Check against custom rules
   - If invalid: escalate with quarantine message
   ↓
Step 13: Tracing
   - Record full decision path in Trace object
   - Calculate latency, token usage
   ↓
Step 14: Persistence
   - Save message, intent, entities to database
   - Update CRM if applicable
   - Log to observability platform
   ↓
Step 15-16: Adapt & Send
   - Format response for channel (WhatsApp/Email/Web)
   - Send via channel adapter
   ↓
AgentResponse (delivered)
```

## Database Schema

```sql
-- Messages (immutable log)
CREATE TABLE messages (
  id UUID PRIMARY KEY,
  business_id UUID NOT NULL,
  user_id VARCHAR NOT NULL,
  conversation_id UUID,
  channel_id VARCHAR(20),
  author VARCHAR(20), -- "user" | "ai" | "system"
  body TEXT NOT NULL,
  intent VARCHAR(50),
  confidence FLOAT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversations (thread grouping)
CREATE TABLE conversations (
  id UUID PRIMARY KEY,
  business_id UUID NOT NULL,
  user_id VARCHAR NOT NULL,
  last_message_at TIMESTAMPTZ,
  status VARCHAR(20), -- "active" | "closed" | "escalated"
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Customers (CRM data)
CREATE TABLE customers (
  id UUID PRIMARY KEY,
  business_id UUID NOT NULL,
  phone_number VARCHAR,
  email_address VARCHAR,
  name VARCHAR(200),
  lead_score INT DEFAULT 0, -- 0-100
  status VARCHAR(20), -- "new" | "contacted" | "qualified" | "customer"
  contacted_count INT DEFAULT 0,
  last_contact_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Knowledge base (searchable documents)
CREATE TABLE knowledge_documents (
  id UUID PRIMARY KEY,
  business_id UUID NOT NULL,
  title VARCHAR(500) NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536), -- pgvector
  category VARCHAR(100),
  source VARCHAR(100),
  enabled BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI jobs (async processing queue)
CREATE TABLE ai_jobs (
  id UUID PRIMARY KEY,
  business_id UUID NOT NULL,
  status VARCHAR(20), -- "pending" | "processing" | "done" | "failed"
  input JSONB NOT NULL,
  output JSONB,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Traces (audit & debugging)
CREATE TABLE traces (
  id UUID PRIMARY KEY,
  business_id UUID NOT NULL,
  message_id UUID,
  step INT,
  step_name VARCHAR(50),
  intent VARCHAR(50),
  confidence FLOAT,
  tools_used TEXT[],
  latency_ms INT,
  token_usage JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Concurrency & Performance

### Parallel Execution

Tools that don't depend on each other execute in parallel:

```typescript
const [crmResult, inventoryResult, emailResult] = await Promise.all([
  crmCreateContactTool.execute(contactParams),
  inventoryCheckStockTool.execute(productParams),
  emailSendTool.execute(emailParams),
]);
```

### Caching Strategy

- **Knowledge base**: Vector embeddings cached in database
- **Conversation history**: Limited to last 20 messages
- **Customer profile**: Fetched once per message
- **Business config**: Cached in memory (refresh every 5 min)

### Rate Limiting

- Per-user: 10 messages/minute
- Per-business: 1000 messages/minute
- Per-API: Anthropic rate limits (50 req/min on free tier)

## Scalability

### Stateless Design

- Each message is independent
- No server state (all in database)
- Horizontal scaling via load balancer
- Multiple instances process messages in parallel

### Queue-Based Processing

- Webhooks return 200 immediately
- Messages queued in `ai_jobs` table
- Worker processes queue (Vercel cron or Lambda)
- Retries on failure with exponential backoff

### Database Performance

- All tenant data partitioned by `business_id`
- Indexes on common queries: `business_id, user_id, created_at`
- Vector index on embeddings for RAG
- Archive old messages after 1 year

## Security

### API Key Management

- Keys stored encrypted in database
- Never logged or exposed in responses
- Rotated monthly
- Revocable per business

### Multi-Tenant Isolation

- RLS (Row-Level Security) enforced in database
- Service role bypassed only in webhook handlers
- All queries scoped by `business_id`
- PII masked in logs

### Input Validation

- Message length capped at 4000 chars
- Phone numbers validated per country
- Email format verified
- SQL injection prevention via parameterized queries

### Output Filtering

- PII detection and masking
- No API keys in responses
- No database URLs
- XSS prevention in web widget

## Monitoring & Observability

### Tracing

Every message produces a `Trace` object recording:
- Each step taken
- Intent & confidence
- Tools executed
- Token usage
- Latency
- Errors

### Metrics

Sent to observability platform (Datadog, New Relic):
- Request latency (p50, p95, p99)
- Intent distribution (what users ask for)
- Escalation rate (% sent to human)
- Token usage by business
- Error rate by type

### Logs

- INFO: Message processed, intent detected
- WARN: Low confidence, approaching rate limit
- ERROR: Failed step, invalid response, provider error

### Debugging

Traces are queryable:
```sql
SELECT * FROM traces 
WHERE business_id = 'acme' 
  AND intent = 'escalate_to_human'
  AND created_at > NOW() - INTERVAL '7 days'
ORDER BY latency_ms DESC;
```

## Testing Strategy

### Unit Tests

- Intent detection (mocked LLM)
- Guard validation
- Tool parameter validation
- Adapter message parsing

### Integration Tests

- Full message pipeline with mocked database
- Adapter roundtrip (parse webhook → format response)
- Tool execution with mock data
- Escalation logic

### End-to-End Tests

- Real database (test tenant)
- Real LLM API (cached responses)
- Webhook simulation
- Adapter verification

## Deployment

### Development

```bash
npm run dev  # Watch mode, local SQLite
```

### Production

```bash
npm run build
npm run test
npm start  # Node.js with PostgreSQL
```

### Continuous Deployment

- Push to `main` triggers CI/CD
- Run tests, type check
- Build Docker image
- Push to registry
- Deploy to ECS / Vercel / Lambda

## Cost Optimization

- Cache knowledge base embeddings
- Batch emails (send every 5 min, not per-message)
- Limit LLM context window
- Archive logs after 30 days
- Use cheaper models for simple tasks (Claude Haiku)

## Roadmap

- [ ] Multi-LLM support (OpenAI, Cohere, local)
- [ ] Fine-tuning on business examples
- [ ] Active learning (collect hard cases)
- [ ] Sentiment analysis (detect anger, urgency)
- [ ] Analytics dashboard
- [ ] Admin UI for knowledge management
- [ ] A/B testing framework for prompts
- [ ] Plugin system for custom tools
