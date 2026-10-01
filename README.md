# Santo AI Agent

Production-grade omnichannel AI agent for business CRM, customer support, and automated messaging.

**Features:**
- 🤖 16-step orchestrator: intent → RAG → rules → tools → response
- 📱 Multi-channel support: WhatsApp, Instagram, Messenger, Email, Web widget
- 💼 CRM integration: lead qualification, appointment booking, follow-up automation
- 🛡️ Response validation & guardrails: no invented prices/policies
- 📊 Confidence scoring & escalation routing
- 🔒 Multi-tenant isolation (RLS in database)
- ⚡ Async processing with idempotency
- 📖 Level 1 LLM intent parsing (optional)

## Quick Start

### Installation

```bash
npm install @santoai/agent
```

### Basic Usage

```typescript
import { createAgent, type AgentConfig } from "@santoai/agent";

const agent = createAgent({
  businessId: "acme-corp",
  businessType: "ecommerce",
  apiKey: process.env.ANTHROPIC_API_KEY,
  knowledgeBase: [
    "Our products: laptops, phones, tablets",
    "Warranty: 2 years on all devices",
    "Shipping: Free on orders over $50"
  ]
});

const response = await agent.process({
  userId: "user-123",
  message: "Do you have iPhone 15 in stock?",
  channelId: "whatsapp",
  metadata: {
    timestamp: Date.now(),
    phoneNumber: "+1234567890"
  }
});

console.log(response.text);        // AI response
console.log(response.intent);      // Detected action: "query_inventory"
console.log(response.confidence);  // 0.92
console.log(response.tools);       // ["inventory_check", "send_message"]
```

## Architecture

### Orchestrator (16 Steps)

1. **Normalize** — Standardize input from any channel
2. **Intent Detection** — Parse user request (LLM + regex fallback)
3. **Entity Extraction** — Pull structured data (name, email, date, etc.)
4. **Context Loading** — Fetch conversation history & customer profile
5. **Knowledge Retrieval** — RAG from knowledge base
6. **Rule Evaluation** — Apply business rules & guardrails
7. **Tool Selection** — Route to appropriate actions
8. **Confidence Check** — Validate response meets threshold
9. **Escalation Decision** — Route to human if needed
10. **Tool Execution** — CRM writes, message sending, etc.
11. **Response Generation** — Craft human-like reply
12. **Validation** — Check response doesn't violate guardrails
13. **Tracing** — Record decision path for debugging
14. **Persistence** — Save message, intent, metadata
15. **Channel Adaptation** — Format for WhatsApp/Email/etc.
16. **Send** — Deliver via adapter

### Components

**Orchestrator** (`orchestrator.ts`)
- 16-step message processing pipeline
- Streaming support for long-running operations
- Decision tracing for observability

**Tools** (`tools.ts`)
- Knowledge retrieval (RAG with embedding search)
- CRM operations (upsert contacts, score leads, log actions)
- Appointment booking
- Follow-up scheduling
- Message sending (multi-channel)
- Business hours checking

**Guards** (`guards.ts`)
- Response validator: no invented information
- Confidence threshold enforcement
- Rate limiting per customer
- Inappropriate content filtering
- PII masking

**Adapters** (`adapters/`)
- WhatsApp Business Cloud API
- Meta (Instagram, Messenger)
- Gmail
- Web widget
- SMS (extensible)

### Business Types Supported

Optimized configurations for:
- `ecommerce` — Online stores, product inventory, order tracking
- `booking` — Salons, clinics, services with appointment scheduling
- `support` — Help desk, FAQs, ticket routing
- `crm` — Sales pipeline, lead qualification, nurturing
- `invoicing` — Billing, tax docs, compliance
- `marketplace` — Multi-vendor platforms
- `leadgen` — Lead capture & qualification
- `whatsapp_omnichannel` — Unified messaging
- `logistics` — Shipment tracking, delivery routing
- `generic` — Custom configurations

## Configuration

```typescript
interface AgentConfig {
  businessId: string;                    // Unique business identifier
  businessType: "ecommerce" | "booking" | "support" | "crm" | ...;
  businessName?: string;
  
  apiKey: string;                        // Anthropic API key
  model?: string;                        // Default: "claude-3-5-sonnet-20241022"
  
  knowledgeBase: string[];               // Business info, policies, FAQs
  customRules?: Rule[];                  // Business-specific guardrails
  
  tools?: {
    crm?: boolean;                       // Enable CRM operations
    scheduling?: boolean;                // Enable appointment booking
    emailNotifications?: boolean;        // Send follow-up emails
  };
  
  confidenceThreshold?: number;          // 0.0-1.0, default: 0.7
  maxContextTokens?: number;             // Limit token budget
  
  // Optional: Supabase or other database for persistence
  database?: {
    url: string;
    apiKey: string;
  };
  
  // Optional: monitoring & logging
  onTrace?: (trace: Trace) => void;
  onError?: (error: Error, context: any) => void;
}
```

## Multi-Tenant Setup

```typescript
import { createTenantManager } from "@santoai/agent";

const manager = createTenantManager({
  database: supabaseClient
});

// Each tenant gets isolated configuration & data
const acmeCorp = manager.createAgent({
  businessId: "acme-corp",
  businessType: "ecommerce",
  apiKey: process.env.ANTHROPIC_API_KEY
});

const laundryShop = manager.createAgent({
  businessId: "mario-laundry",
  businessType: "booking",
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Process with automatic tenant isolation
const response = await acmeCorp.process(message);
```

## Integrating Channels

Add WhatsApp, Instagram, Email, or custom channels:

```typescript
import { WhatsAppAdapter } from "@santoai/agent/adapters";

const whatsapp = new WhatsAppAdapter({
  phoneNumberId: process.env.WHATSAPP_PHONE_ID,
  businessAccountId: process.env.WHATSAPP_BA_ID,
  accessToken: process.env.META_ACCESS_TOKEN,
  webhookSecret: process.env.META_WEBHOOK_SECRET
});

agent.registerAdapter("whatsapp", whatsapp);

// Webhook handler
app.post("/webhooks/whatsapp", async (req, res) => {
  const message = await whatsapp.parseWebhook(req.body);
  const response = await agent.process(message);
  await whatsapp.send(response);
  res.sendStatus(200);
});
```

## Level 1 Intent Parsing (Optional Enhancement)

Add natural language intent detection to your UI:

```typescript
import { parseLevel1Intent } from "@santoai/agent";

// Returns: { action, confidence, params }
const intent = await parseLevel1Intent(
  "I want to book an appointment for tomorrow at 2pm",
  "booking",
  { apiKey: process.env.ANTHROPIC_API_KEY }
);

// { action: "book_appointment", confidence: 0.92, params: { date: "tomorrow", time: "14:00" } }
```

## Testing

```bash
npm test
```

## Deployment

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package* .
RUN npm ci --only=production
COPY dist dist
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
```

### Vercel (Next.js + Santo AI Agent)

```typescript
// api/chat/route.ts
import { agent } from "@/lib/agent";

export async function POST(req: Request) {
  const { message, businessId } = await req.json();
  const response = await agent.process({ message, businessId });
  return Response.json(response);
}
```

### AWS Lambda

```typescript
import { createAgent } from "@santoai/agent";

const agent = createAgent({ /* config */ });

export const handler = async (event) => {
  const message = JSON.parse(event.body);
  return await agent.process(message);
};
```

## Monitoring

```typescript
const agent = createAgent({
  // ...config
  onTrace: (trace: Trace) => {
    console.log(`Intent: ${trace.intent}, Confidence: ${trace.confidence}`);
    console.log(`Tools: ${trace.tools.join(", ")}`);
    console.log(`Latency: ${trace.latencyMs}ms`);
    
    // Send to observability platform
    sendToDatadog({
      metric: "agent.latency",
      value: trace.latencyMs,
      tags: { business: trace.businessId, intent: trace.intent }
    });
  }
});
```

## API Reference

### `agent.process(input)`

Main entry point for message processing.

```typescript
interface AgentInput {
  userId: string;                    // Customer identifier
  message: string;                   // User message text
  channelId: "whatsapp" | "email" | "web" | ...;
  metadata?: {
    timestamp?: number;
    phoneNumber?: string;
    emailAddress?: string;
    timezone?: string;
    locale?: string;
  };
}

interface AgentResponse {
  text: string;                      // AI response
  intent: string | null;             // Detected action
  confidence: number;                // 0.0-1.0
  tools: string[];                   // Tools that were executed
  sources: string[];                 // Knowledge sources used
  escalated: boolean;                // Routed to human?
  escalationReason?: string;
  traceId: string;                   // For debugging
}
```

### `agent.loadKnowledge(documents)`

Add documents to the knowledge base at runtime:

```typescript
await agent.loadKnowledge([
  {
    id: "policy-refund",
    title: "Refund Policy",
    content: "We offer 30-day full refunds...",
    metadata: { category: "policies" }
  },
  // ... more documents
]);
```

### `agent.updateRules(rules)`

Apply dynamic guardrails:

```typescript
agent.updateRules([
  {
    id: "max-discount",
    description: "Never offer more than 20% discount",
    check: (response) => !response.text.includes("more than 20%")
  }
]);
```

## Examples

See `/examples` directory:
- `e-commerce.ts` — Product queries, inventory, order tracking
- `booking.ts` — Appointment scheduling, cancellations
- `support.ts` — FAQ routing, escalation logic
- `multi-tenant.ts` — Managing multiple businesses
- `custom-adapter.ts` — Building a new channel adapter

## Contributing

Bug reports and PRs welcome at [GitHub Issues](https://github.com/facturacionexpressrd-commits/santo-ai-agent/issues).

## License

MIT
