# Santo AI Agent - Setup Guide

Complete guide to installing, configuring, and deploying Santo AI Agent.

## Prerequisites

- Node.js 18+ 
- npm or yarn
- Anthropic API key (get from [console.anthropic.com](https://console.anthropic.com))
- Database (Supabase, PostgreSQL, or any SQL db)

## 1. Installation

### Via NPM

```bash
npm install @santoai/agent
```

### From GitHub

```bash
git clone https://github.com/facturacionexpressrd-commits/santo-ai-agent.git
cd santo-ai-agent
npm install
npm run build
```

## 2. Configuration

### Environment Variables

Create `.env.local`:

```bash
# Anthropic API
ANTHROPIC_API_KEY=sk-ant-v1-...

# Database (optional, for persistence)
DATABASE_URL=postgresql://user:password@localhost/santo
DATABASE_API_KEY=...

# Channels (if using adapters)
WHATSAPP_PHONE_ID=...
WHATSAPP_BUSINESS_ACCOUNT_ID=...
META_ACCESS_TOKEN=...

# Email
SENDGRID_API_KEY=...
SENDGRID_FROM_EMAIL=support@business.com

# SMS (if using)
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=...
```

### Basic Config

```typescript
// config.ts
import { createAgent, type AgentConfig } from "@santoai/agent";

export const agentConfig: AgentConfig = {
  businessId: "my-business",
  businessType: "ecommerce", // or "booking", "support", "crm", etc.
  businessName: "My Business",
  
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: "claude-3-5-sonnet-20241022", // optional
  
  knowledgeBase: [
    "We sell laptops, phones, and tablets",
    "Free shipping on orders over $50",
    "2-year warranty on all products",
    "Returns accepted within 30 days",
    "Hours: Mon-Fri 9am-6pm EST",
  ],
  
  confidenceThreshold: 0.7,
  
  onError: (error, context) => {
    console.error("[Agent Error]", error.message);
    // Send to error tracking (Sentry, Datadog, etc.)
  },
  
  onTrace: (trace) => {
    console.log(`[${trace.intent}] ${trace.confidence.toFixed(2)}`);
  },
};

export const agent = createAgent(agentConfig);
```

## 3. Using the Agent

### Basic Chat

```typescript
import { agent } from "./config";

async function handleMessage(userMessage: string, userId: string) {
  const response = await agent.process({
    userId,
    message: userMessage,
    channelId: "web",
    metadata: {
      timestamp: Date.now(),
      timezone: "America/New_York",
    },
  });

  console.log("Agent:", response.text);
  console.log("Intent:", response.intent);
  console.log("Confidence:", response.confidence);
  
  if (response.escalated) {
    console.log("Reason:", response.escalationReason);
    // Route to human agent
  }
}
```

### With Channels

```typescript
import {
  agent,
  createAdapter,
  WhatsAppAdapter,
} from "@santoai/agent";

// Register WhatsApp adapter
const whatsapp = new WhatsAppAdapter({
  phoneNumberId: process.env.WHATSAPP_PHONE_ID!,
  businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID!,
  accessToken: process.env.META_ACCESS_TOKEN!,
});

// Handle incoming webhook
app.post("/webhooks/whatsapp", async (req, res) => {
  try {
    // Parse incoming message
    const agentInput = await whatsapp.parseWebhook(req.body);

    // Process with agent
    const response = await agent.process(agentInput);

    // Send response
    response.metadata = { phoneNumber: agentInput.metadata?.phoneNumber };
    await whatsapp.send(response);

    res.sendStatus(200);
  } catch (error) {
    console.error("Webhook error:", error);
    res.sendStatus(400);
  }
});
```

## 4. Integrations

### Next.js / Vercel

```typescript
// app/api/chat/route.ts
import { agent } from "@/lib/agent-config";

export async function POST(req: Request) {
  const { message, userId } = await req.json();

  const response = await agent.process({
    userId,
    message,
    channelId: "web",
  });

  return Response.json(response);
}
```

### Express

```typescript
// routes/chat.ts
import { agent } from "../lib/agent-config";

app.post("/api/chat", async (req, res) => {
  const { message, userId } = req.body;

  const response = await agent.process({
    userId,
    message,
    channelId: "web",
  });

  res.json(response);
});
```

### Fastify

```typescript
// plugins/agent.ts
import { agent } from "../config";

export default async function agentPlugin(fastify: FastifyInstance) {
  fastify.post("/chat", async (request, reply) => {
    const { message, userId } = request.body;

    const response = await agent.process({
      userId,
      message,
      channelId: "web",
    });

    return response;
  });
}
```

### AWS Lambda

```typescript
// lambda.ts
import { createAgent } from "@santoai/agent";

const agent = createAgent({
  businessId: process.env.BUSINESS_ID!,
  businessType: process.env.BUSINESS_TYPE,
  apiKey: process.env.ANTHROPIC_API_KEY!,
  knowledgeBase: JSON.parse(process.env.KNOWLEDGE_BASE!),
});

export const handler = async (event: any) => {
  const { message, userId } = JSON.parse(event.body);

  const response = await agent.process({
    userId,
    message,
    channelId: "web",
  });

  return {
    statusCode: 200,
    body: JSON.stringify(response),
  };
};
```

## 5. Multi-Tenant Setup

```typescript
import { createAgent } from "@santoai/agent";

class TenantManager {
  private agents = new Map();

  createAgent(businessId: string, config: AgentConfig) {
    const agent = createAgent({
      ...config,
      businessId,
    });
    this.agents.set(businessId, agent);
    return agent;
  }

  getAgent(businessId: string) {
    return this.agents.get(businessId);
  }
}

const tenants = new TenantManager();

// Create agents for each tenant
const acmeAgent = tenants.createAgent("acme-corp", {
  businessType: "ecommerce",
  apiKey: process.env.ANTHROPIC_API_KEY!,
  knowledgeBase: [...],
});

const shopAgent = tenants.createAgent("mario-shop", {
  businessType: "booking",
  apiKey: process.env.ANTHROPIC_API_KEY!,
  knowledgeBase: [...],
});

// Route requests to correct agent
app.post("/api/chat/:businessId", async (req, res) => {
  const { businessId } = req.params;
  const agent = tenants.getAgent(businessId);
  
  if (!agent) {
    return res.status(404).json({ error: "Business not found" });
  }

  const response = await agent.process({
    userId: req.body.userId,
    message: req.body.message,
    channelId: "web",
  });

  res.json(response);
});
```

## 6. Monitoring & Logging

```typescript
import winston from "winston";

const logger = winston.createLogger({
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.File({ filename: "combined.log" }),
  ],
});

const agent = createAgent({
  // ... config
  onTrace: (trace) => {
    logger.info("Agent trace", {
      traceId: trace.traceId,
      intent: trace.intent,
      confidence: trace.confidence,
      latencyMs: trace.latencyMs,
      tokenUsage: trace.tokenUsage,
    });
  },
  
  onError: (error, context) => {
    logger.error("Agent error", {
      error: error.message,
      context,
    });
  },
});
```

## 7. Custom Business Rules

```typescript
const agent = createAgent({
  // ... config
  customRules: [
    {
      id: "max-discount",
      name: "Maximum Discount",
      description: "Never offer discounts over 20%",
      kind: "never",
      category: "pricing",
      instruction: "Offer discounts higher than 20%",
      priority: 5,
      enabled: true,
    },
    {
      id: "after-hours",
      name: "After Hours Response",
      description: "Escalate after business hours",
      kind: "always",
      category: "general",
      instruction: "Let customer know business hours",
      priority: 4,
      enabled: true,
    },
  ],
});
```

## 8. Deployment

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist dist
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### Build & Deploy

```bash
npm run build
docker build -t santo-ai-agent .
docker run -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY santo-ai-agent
```

### Vercel Deploy

```bash
vercel --prod
```

### AWS ECS

```bash
aws ecr create-repository --repository-name santo-ai-agent
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin [YOUR_ACCOUNT_ID].dkr.ecr.us-east-1.amazonaws.com

docker tag santo-ai-agent [YOUR_ACCOUNT_ID].dkr.ecr.us-east-1.amazonaws.com/santo-ai-agent:latest
docker push [YOUR_ACCOUNT_ID].dkr.ecr.us-east-1.amazonaws.com/santo-ai-agent:latest

# Update ECS service
aws ecs update-service --cluster default --service santo-ai --force-new-deployment
```

## 9. Troubleshooting

### Common Issues

**"Invalid API key"**
- Verify ANTHROPIC_API_KEY is set and valid
- Check API key hasn't expired in console.anthropic.com

**"Knowledge base is empty"**
- Provide at least one string in knowledgeBase array
- Use loadKnowledge() to add documents dynamically

**"Response escalated unexpectedly"**
- Check confidence threshold (default 0.7)
- Review custom rules that might trigger escalation
- Check response validation guards

**"Channel adapter errors"**
- Verify credentials for WhatsApp, email, etc.
- Test webhook parsing with sample payloads
- Check message format matches expectations

## 10. Next Steps

- Add Level 1 intent parsing UI with `@aisettings/core`
- Set up monitoring dashboard (Datadog, New Relic)
- Create admin panel for managing knowledge base
- Add A/B testing for different prompt variations
- Build analytics pipeline for message metrics

## Support

Issues: [GitHub Issues](https://github.com/facturacionexpressrd-commits/santo-ai-agent/issues)
Docs: [Full Documentation](./ARCHITECTURE.md)
