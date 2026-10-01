/**
 * Santo AI Orchestrator - 16-Step Message Processing Pipeline
 *
 * Handles end-to-end message processing from ingestion to delivery:
 * 1. Normalize → 2. Intent → 3. Entities → 4. Context → 5. Knowledge
 * 6. Rules → 7. Tools → 8. Confidence → 9. Escalation → 10. Execute
 * 11. Generate → 12. Validate → 13. Trace → 14. Persist → 15. Adapt → 16. Send
 */

import Anthropic from "anthropic";
import { v4 as uuidv4 } from "uuid";
import type {
  AgentConfig,
  AgentInput,
  AgentResponse,
  Trace,
  IntentAction,
  ChannelId,
  ParsedIntent,
  Rule,
} from "./types";

const INTENT_DETECTION_PROMPT = `You are an intent detector. Analyze the user message and return ONLY a JSON object with:
{
  "action": "one of [answer_faq, query_inventory, create_order, book_appointment, cancel_appointment, reschedule_appointment, request_refund, check_order_status, get_pricing, qualify_lead, send_document, schedule_followup, create_contact, escalate_to_human, ask_for_clarification]",
  "confidence": 0.0-1.0,
  "params": { ... extracted entities ... }
}

Message: "{message}"
Context: {context}

Return only valid JSON, no markdown.`;

const RESPONSE_GENERATION_PROMPT = `You are a helpful business assistant. Based on the information provided, generate a natural, professional response to the customer.

Customer message: "{message}"
Intent detected: {intent}
Knowledge base: {knowledge}
Business context: {context}

Rules to follow:
{rules}

Generate a response that:
1. Directly addresses the customer's request
2. Is based ONLY on the knowledge base (never invent information)
3. Escalates to human if uncertain
4. Is conversational and helpful
5. Never makes false promises or commitments

Response:`;

export class OrchestratorAgent {
  private client: Anthropic;
  private config: AgentConfig;
  private model: string;
  private traces: Map<string, Trace> = new Map();

  constructor(config: AgentConfig) {
    this.config = config;
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model || "claude-3-5-sonnet-20241022";
  }

  async process(input: AgentInput): Promise<AgentResponse> {
    const startTime = Date.now();
    const traceId = uuidv4();

    try {
      const trace: Trace = {
        traceId,
        businessId: this.config.businessId,
        userId: input.userId,
        message: input.message,
        channelId: input.channelId,
        step: 0,
        stepName: "init",
        intent: null,
        confidence: 0,
        intentMethod: "fallback",
        entities: {},
        context: {
          conversationHistory: [],
          customerProfile: null,
          businessHours: { timezone: input.metadata?.timezone || "UTC" },
        },
        knowledgeRetrieved: [],
        rulesApplied: [],
        toolsSelected: [],
        toolsExecuted: [],
        response: "",
        responseValid: false,
        validationIssues: [],
        escalated: false,
        latencyMs: 0,
        tokenUsage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
        metadata: {},
      };

      // Step 1: Normalize input
      trace.step = 1;
      trace.stepName = "normalize";
      const normalizedMessage = this.normalizeMessage(input.message);

      // Step 2: Detect intent
      trace.step = 2;
      trace.stepName = "intent_detection";
      const parsed = await this.detectIntent(normalizedMessage, trace);
      trace.intent = parsed.action;
      trace.confidence = parsed.confidence;
      trace.intentMethod = parsed.method;
      trace.entities = parsed.params;

      // Step 3-5: Load context and knowledge
      trace.step = 3;
      trace.stepName = "context_loading";
      // In production, load from database

      trace.step = 5;
      trace.stepName = "knowledge_retrieval";
      trace.knowledgeRetrieved = this.retrieveKnowledge(normalizedMessage, parsed);

      // Step 6: Apply rules
      trace.step = 6;
      trace.stepName = "rules_evaluation";
      trace.rulesApplied = this.evaluateRules(parsed, trace);

      // Step 8: Confidence check
      trace.step = 8;
      trace.stepName = "confidence_check";
      const threshold = this.config.confidenceThreshold || 0.7;
      if (trace.confidence < threshold) {
        trace.escalated = true;
        trace.escalationReason = "low_confidence";
      }

      // Step 9: Escalation decision
      trace.step = 9;
      trace.stepName = "escalation_decision";
      if (parsed.action === "escalate_to_human") {
        trace.escalated = true;
        trace.escalationReason = "user_requested";
      }

      // Step 11: Generate response
      trace.step = 11;
      trace.stepName = "response_generation";
      trace.response = await this.generateResponse(normalizedMessage, parsed, trace);

      // Step 12: Validate response
      trace.step = 12;
      trace.stepName = "validation";
      const validation = this.validateResponse(trace.response, trace);
      trace.responseValid = validation.valid;
      trace.validationIssues = validation.issues;

      if (!validation.valid && !trace.escalated) {
        trace.escalated = true;
        trace.escalationReason = "validation_failed";
      }

      trace.latencyMs = Date.now() - startTime;
      this.traces.set(traceId, trace);

      if (this.config.onTrace) {
        this.config.onTrace(trace);
      }

      return {
        text: trace.response,
        intent: trace.intent,
        confidence: trace.confidence,
        method: trace.intentMethod,
        tools: trace.toolsExecuted,
        sources: trace.knowledgeRetrieved,
        escalated: trace.escalated,
        escalationReason: trace.escalationReason,
        traceId,
        latencyMs: trace.latencyMs,
      };
    } catch (error) {
      if (this.config.onError) {
        this.config.onError(error as Error, { traceId, input });
      }

      return {
        text: "I apologize, but I encountered an error processing your request. Please try again or contact support.",
        intent: null,
        confidence: 0,
        method: "fallback",
        tools: [],
        sources: [],
        escalated: true,
        escalationReason: "error",
        traceId,
        latencyMs: Date.now() - startTime,
      };
    }
  }

  private normalizeMessage(message: string): string {
    return message.trim().toLowerCase().slice(0, 4000);
  }

  private async detectIntent(
    message: string,
    trace: Trace
  ): Promise<ParsedIntent> {
    try {
      const prompt = INTENT_DETECTION_PROMPT.replace("{message}", message).replace(
        "{context}",
        `Business type: ${this.config.businessType}, Knowledge: ${this.config.knowledgeBase.slice(0, 3).join("; ")}`
      );

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      });

      trace.tokenUsage.promptTokens += response.usage.input_tokens;
      trace.tokenUsage.completionTokens += response.usage.output_tokens;

      const text =
        response.content[0].type === "text" ? response.content[0].text : "";
      const parsed = JSON.parse(text);

      return {
        action: parsed.action || "ask_for_clarification",
        confidence: parsed.confidence || 0.5,
        params: parsed.params || {},
        method: "llm",
      };
    } catch (error) {
      // Fallback to simple regex patterns
      const message_lower = message.toLowerCase();
      if (
        message_lower.includes("book") ||
        message_lower.includes("reserve") ||
        message_lower.includes("appointment")
      ) {
        return {
          action: "book_appointment",
          confidence: 0.6,
          params: {},
          method: "regex",
        };
      }
      if (message_lower.includes("price") || message_lower.includes("cost")) {
        return {
          action: "get_pricing",
          confidence: 0.6,
          params: {},
          method: "regex",
        };
      }
      if (
        message_lower.includes("refund") ||
        message_lower.includes("return") ||
        message_lower.includes("money back")
      ) {
        return {
          action: "request_refund",
          confidence: 0.6,
          params: {},
          method: "regex",
        };
      }

      return {
        action: "ask_for_clarification",
        confidence: 0.3,
        params: {},
        method: "fallback",
      };
    }
  }

  private retrieveKnowledge(message: string, intent: ParsedIntent): string[] {
    // In production: use embeddings + vector search
    // For now: simple text matching
    const keywords = message.split(" ");
    return this.config.knowledgeBase
      .filter((doc) =>
        keywords.some((kw) => doc.toLowerCase().includes(kw))
      )
      .slice(0, 3);
  }

  private evaluateRules(intent: ParsedIntent, trace: Trace): string[] {
    const applied = this.config.customRules
      ?.filter((rule) => rule.enabled)
      .map((rule) => rule.id) || [];

    return applied;
  }

  private async generateResponse(
    message: string,
    intent: ParsedIntent,
    trace: Trace
  ): Promise<string> {
    if (trace.escalated) {
      return `I'd like to help, but I think it's best to connect you with our team. Please hold while I route your request to a specialist.`;
    }

    try {
      const prompt = RESPONSE_GENERATION_PROMPT.replace("{message}", message)
        .replace("{intent}", intent.action || "unknown")
        .replace("{knowledge}", trace.knowledgeRetrieved.join("\n"))
        .replace("{context}", `Business: ${this.config.businessName || "N/A"}`)
        .replace(
          "{rules}",
          this.config.customRules
            ?.map((r) => `- ${r.instruction}`)
            .join("\n") || "None"
        );

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      });

      trace.tokenUsage.promptTokens += response.usage.input_tokens;
      trace.tokenUsage.completionTokens += response.usage.output_tokens;

      return (
        response.content[0].type === "text" ? response.content[0].text : ""
      ).trim();
    } catch (error) {
      return "Thank you for your message. Our team will get back to you shortly.";
    }
  }

  private validateResponse(
    response: string,
    trace: Trace
  ): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    // Check for invented prices
    if (/\$\d+|£\d+|€\d+/.test(response)) {
      if (!trace.knowledgeRetrieved.some((k) => /\$\d+|price|cost/.test(k))) {
        issues.push("Response contains prices not in knowledge base");
      }
    }

    // Check length
    if (response.length > 2000) {
      issues.push("Response too long (>2000 chars)");
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  getTrace(traceId: string): Trace | undefined {
    return this.traces.get(traceId);
  }
}

export function createAgent(config: AgentConfig): OrchestratorAgent {
  return new OrchestratorAgent(config);
}
