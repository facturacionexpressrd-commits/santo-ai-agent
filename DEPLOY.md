# Santo AI Agent - Deployment Guide

Complete guide to deploying Santo AI Agent to production.

## Pre-Deployment Checklist

- [ ] API keys configured (.env.local)
- [ ] Database migrations applied
- [ ] Tests passing (npm test)
- [ ] Type checking passes (tsc --noEmit)
- [ ] Build successful (npm run build)
- [ ] Documentation reviewed
- [ ] Security audit completed
- [ ] Load testing done (if applicable)

## Development Environment

```bash
# Install dependencies
npm install

# Start dev mode (watch + rebuild)
npm run dev

# Run tests
npm test

# Type check
npm run typecheck

# Build
npm run build
```

## Staging Deployment

### Vercel (Recommended for Next.js)

```bash
# Link project
vercel link

# Deploy to staging
vercel --prod=false

# Set environment variables
vercel env pull .env.local

# Test staging
curl https://[project].vercel.app/api/health
```

### Docker

```bash
# Build image
docker build -t santo-ai-agent:staging .

# Run locally
docker run -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  -e DATABASE_URL=$DATABASE_URL \
  -p 3000:3000 \
  santo-ai-agent:staging

# Push to registry
docker tag santo-ai-agent:staging gcr.io/my-project/santo-ai-agent:staging
docker push gcr.io/my-project/santo-ai-agent:staging
```

## Production Deployment

### Option 1: Vercel (Next.js)

Easiest for Next.js projects:

```bash
vercel --prod
```

- Automatic HTTPS
- Global CDN
- Built-in monitoring
- Easy rollbacks

### Option 2: AWS ECS

For containerized deployments:

```bash
# Build and push image
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin [ACCOUNT_ID].dkr.ecr.us-east-1.amazonaws.com

docker build -t santo-ai-agent:latest .
docker tag santo-ai-agent:latest [ACCOUNT_ID].dkr.ecr.us-east-1.amazonaws.com/santo-ai-agent:latest
docker push [ACCOUNT_ID].dkr.ecr.us-east-1.amazonaws.com/santo-ai-agent:latest

# Update ECS service
aws ecs update-service \
  --cluster production \
  --service santo-ai \
  --force-new-deployment
```

Configuration:
- Auto-scaling based on CPU/memory
- Load balancer for high availability
- RDS PostgreSQL for database
- CloudWatch for monitoring

### Option 3: AWS Lambda

Serverless deployment:

```bash
# Package function
zip -r lambda-function.zip dist node_modules

# Deploy
aws lambda update-function-code \
  --function-name santo-ai-agent \
  --zip-file fileb://lambda-function.zip
```

Environment variables:
- ANTHROPIC_API_KEY
- DATABASE_URL
- BUSINESS_ID

### Option 4: Google Cloud Run

```bash
# Build and push
gcloud builds submit --tag gcr.io/[PROJECT_ID]/santo-ai-agent

# Deploy
gcloud run deploy santo-ai-agent \
  --image gcr.io/[PROJECT_ID]/santo-ai-agent \
  --platform managed \
  --region us-central1 \
  --set-env-vars ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY
```

## Database Setup

### PostgreSQL (Primary)

```bash
# Create database
createdb santo_ai

# Run migrations
psql -d santo_ai -f migrations/001_init.sql
psql -d santo_ai -f migrations/002_knowledge.sql
psql -d santo_ai -f migrations/003_jobs.sql

# Enable extensions
psql -d santo_ai -c "CREATE EXTENSION vector;"
psql -d santo_ai -c "CREATE EXTENSION uuid-ossp;"
```

### Supabase (Recommended)

```bash
# Initialize Supabase
supabase init

# Link to project
supabase link --project-ref $PROJECT_REF

# Push migrations
supabase db push

# Generate types
supabase gen types typescript --project-ref $PROJECT_REF > types/database.ts
```

## Environment Variables

Production .env:

```bash
# Core
NODE_ENV=production
PORT=3000

# API Keys
ANTHROPIC_API_KEY=sk-ant-v1-...
DATABASE_URL=postgresql://user:pass@host/db

# Business Configuration (per-tenant)
BUSINESS_ID=acme-corp
BUSINESS_TYPE=ecommerce
BUSINESS_NAME=ACME Corporation

# Channels
WHATSAPP_PHONE_ID=...
WHATSAPP_BUSINESS_ACCOUNT_ID=...
META_ACCESS_TOKEN=...

# Email
SENDGRID_API_KEY=...
SENDGRID_FROM_EMAIL=support@acmecorp.com

# SMS
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+1234567890

# Monitoring
DATADOG_API_KEY=...
SENTRY_DSN=...

# Security
WEBHOOK_SECRET=... (random 32-char string)
JWT_SECRET=... (random 32-char string)

# Optional
LOG_LEVEL=info
MAX_TOKENS=8000
CONFIDENCE_THRESHOLD=0.7
```

## Health Checks

Configure health endpoint:

```typescript
// api/health.ts
import { createAgent } from "@santoai/agent";

app.get("/api/health", async (req, res) => {
  try {
    // Quick sanity checks
    const hasEnv = !!process.env.ANTHROPIC_API_KEY;
    const hasDb = await checkDatabase();
    
    if (hasEnv && hasDb) {
      return res.json({ status: "healthy", timestamp: new Date() });
    } else {
      return res.status(503).json({ status: "unhealthy" });
    }
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});
```

Monitoring:
- Check every 30 seconds
- Alert if 2 consecutive failures
- Page on-call engineer

## Monitoring & Alerting

### Metrics to Watch

**Performance:**
- Request latency (p50, p95, p99)
- Database query time
- Token usage
- Memory usage

**Business:**
- Message throughput (msg/sec)
- Intent distribution
- Escalation rate
- User satisfaction

**Errors:**
- 5xx error rate
- Database connection errors
- API timeouts
- Validation failures

### Datadog Setup

```python
from datadog import api, statsd

# Log metrics
statsd.increment("agent.message.processed")
statsd.timing("agent.latency_ms", latency)
statsd.gauge("agent.queue_depth", queue_size)

# Log events
api.Event.create(
  title="Agent Deployment",
  text="Deployed to production",
  tags=["deployment", "production"]
)
```

### Alerts

Configure alerts:

```yaml
# Latency
- alert_if(metric('agent.latency_ms').p95 > 3000, for: '5m')
  notify: pagerduty

# Error rate
- alert_if(metric('agent.errors').rate > 0.01, for: '2m')
  notify: slack

# Escalation rate
- alert_if(metric('agent.escalations').rate > 0.2, for: '5m')
  notify: email
```

## Rollback Strategy

### Quick Rollback (Vercel)

```bash
# View deployments
vercel deployments

# Rollback to previous
vercel rollback [DEPLOYMENT_ID]
```

### Database Rollback

```bash
# If migration fails, rollback
psql -d santo_ai -f migrations/rollback/001_init.sql

# Or use Supabase
supabase db pull  # Get latest schema
git checkout migrations/  # Revert to working state
supabase db push
```

### Zero-Downtime Deploy

1. Deploy new version
2. Run both versions simultaneously
3. Monitor error rates
4. Gradually route traffic (blue-green)
5. Stop old version after stable

## Performance Tuning

### Database Optimization

```sql
-- Create indexes
CREATE INDEX idx_messages_business_id ON messages(business_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX idx_customers_business_id ON customers(business_id);

-- Vector index for RAG
CREATE INDEX idx_knowledge_embedding ON knowledge_documents 
USING ivfflat (embedding vector_cosine_ops);
```

### Connection Pooling

```typescript
const pool = new Pool({
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

### Caching Strategy

- Redis for session data (optional)
- In-memory cache for knowledge base
- CDN for static assets
- Browser cache for assets

## Security Hardening

### API Security

```typescript
// Rate limiting
import rateLimit from "express-rate-limit";

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100, // 100 requests per minute
});

app.use("/api/", limiter);
```

### HTTPS/TLS

- Force HTTPS redirects
- HSTS headers
- Certificate pinning (optional)

### Input Validation

```typescript
// Validate all inputs
import { z } from "zod";

const messageSchema = z.object({
  userId: z.string().min(1).max(100),
  message: z.string().min(1).max(4000),
  channelId: z.enum(["whatsapp", "email", "web", "sms"]),
});

app.post("/api/chat", (req, res) => {
  const validated = messageSchema.parse(req.body);
  // Process...
});
```

## Disaster Recovery

### Backup Strategy

- Daily database backups (automated)
- 30-day retention
- Test restore weekly
- Encrypted backups in separate region

### High Availability

- Multiple instances (3+)
- Load balancer
- Database replication
- Multi-region failover (planned)

### Incident Response

1. **Detect**: Monitoring alerts + on-call notification
2. **Investigate**: Check logs, database, metrics
3. **Mitigate**: Scale up, rollback, route to fallback
4. **Resolve**: Fix root cause, deploy patch
5. **Post-mortem**: Document, improve prevention

## Cost Optimization

### Resource Usage

- Auto-scaling based on load
- Scheduled scaling (peak hours)
- Reserved instances for baseline
- Spot instances for burst

### Monitoring Spend

```bash
# AWS
aws ce get-cost-and-usage \
  --time-period Start=2026-01-01,End=2026-01-31 \
  --granularity MONTHLY \
  --metrics BlendedCost

# Vercel
vercel analytics  # Built-in dashboard
```

## Upgrade Path

### Minor Updates (patch)

Deploy directly:
```bash
git pull origin main
npm install
npm run build
vercel --prod
```

### Major Updates

Follow this process:
1. Deploy to staging
2. Test with real data
3. Run migrations (if needed)
4. A/B test with 10% traffic
5. Gradually increase to 100%
6. Monitor error rates
7. Full rollout

## Success Criteria

Before considering deployment complete:

- [ ] All health checks passing
- [ ] Error rate < 0.1%
- [ ] P99 latency < 5 seconds
- [ ] Database responding normally
- [ ] All alerts configured
- [ ] Runbook updated
- [ ] Team trained
- [ ] Escalation contacts verified
- [ ] Monitoring dashboard live

## Support Contacts

On-call rotation:
- Primary: [name] ([email])
- Secondary: [name] ([email])

Escalation:
- Page PagerDuty for severity 1-2
- Slack #incidents for severity 3+

Documentation links:
- Runbook: [link]
- Architecture: [link]
- API docs: [link]
