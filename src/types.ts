/**
 * Santo AI Agent - Type Definitions
 *
 * Core interfaces for the omnichannel AI agent orchestrator
 */

export type BusinessType =
  | "ecommerce"
  | "booking"
  | "support"
  | "crm"
  | "invoicing"
  | "marketplace"
  | "leadgen"
  | "whatsapp_omnichannel"
  | "logistics"
  | "fe_pos"
  | "generic";

export type ChannelId = "whatsapp" | "instagram" | "messenger" | "email" | "web" | "sms";

export type IntentAction =
  | "answer_faq"
  | "query_inventory"
  | "create_order"
  | "book_appointment"
  | "cancel_appointment"
  | "reschedule_appointment"
  | "request_refund"
  | "check_order_status"
  | "get_pricing"
  | "qualify_lead"
  | "send_document"
  | "schedule_followup"
  | "create_contact"
  | "escalate_to_human"
  | "ask_for_clarification";

export type PermissionLevel = "auto" | "confirm" | "approval" | "human" | "never";

export interface AgentConfig {
  businessId: string;
  businessType: BusinessType;
  businessName?: string;
  businessDescription?: string;

  apiKey: string;
  model?: string;
  maxTokens?: number;

  knowledgeBase: string[];
  customRules?: Rule[];

  tools?: {
    crm?: boolean;
    scheduling?: boolean;
    emailNotifications?: boolean;
    inventory?: boolean;
  };

  confidenceThreshold?: number;
  maxContextTokens?: number;
  enableStreamingResponse?: boolean;

  database?: {
    url: string;
    apiKey: string;
  };

  onTrace?: (trace: Trace) => void;
  onError?: (error: Error, context: any) => void;
}

export interface AgentInput {
  userId: string;
  message: string;
  channelId: ChannelId;
  conversationId?: string;
  metadata?: {
    timestamp?: number;
    phoneNumber?: string;
    emailAddress?: string;
    timezone?: string;
    locale?: string;
    [key: string]: any;
  };
}

export interface AgentResponse {
  text: string;
  intent: IntentAction | null;
  confidence: number;
  method: "llm" | "regex" | "fallback";
  tools: string[];
  sources: string[];
  escalated: boolean;
  escalationReason?: string;
  metadata?: {
    [key: string]: any;
  };
  traceId: string;
  latencyMs: number;
}

export interface Trace {
  traceId: string;
  businessId: string;
  userId: string;
  message: string;
  channelId: ChannelId;

  step: number;
  stepName: string;

  intent: IntentAction | null;
  confidence: number;
  intentMethod: "llm" | "regex" | "fallback";

  entities: Record<string, any>;
  context: {
    conversationHistory: Message[];
    customerProfile: CustomerProfile | null;
    businessHours: BusinessHours;
  };

  knowledgeRetrieved: string[];
  rulesApplied: string[];
  toolsSelected: string[];
  toolsExecuted: string[];

  response: string;
  responseValid: boolean;
  validationIssues: string[];

  escalated: boolean;
  escalationReason?: string;

  latencyMs: number;
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };

  metadata: Record<string, any>;
}

export interface Message {
  id: string;
  conversationId: string;
  userId: string;
  authorId: string; // "user" | "ai" | "system"
  text: string;
  channelId: ChannelId;
  createdAt: number;
  metadata?: Record<string, any>;
}

export interface CustomerProfile {
  id: string;
  businessId: string;
  phoneNumber?: string;
  emailAddress?: string;
  name?: string;
  contactedCount: number;
  lastContactAt: number;
  leadScore: number; // 0-100
  status: "new" | "contacted" | "qualified" | "customer" | "inactive";
  metadata?: Record<string, any>;
}

export interface BusinessHours {
  timezone: string;
  monday?: { start: string; end: string };
  tuesday?: { start: string; end: string };
  wednesday?: { start: string; end: string };
  thursday?: { start: string; end: string };
  friday?: { start: string; end: string };
  saturday?: { start: string; end: string };
  sunday?: { start: string; end: string };
  holidays?: string[]; // ISO dates
}

export interface Rule {
  id: string;
  name: string;
  description: string;
  kind: "always" | "never";
  category:
    | "pricing"
    | "policies"
    | "compliance"
    | "branding"
    | "general";
  instruction: string;
  priority: number; // 1-5, higher = earlier execution
  enabled: boolean;
  metadata?: Record<string, any>;
}

export interface Document {
  id: string;
  title: string;
  content: string;
  embedding?: number[];
  metadata?: {
    category?: string;
    tags?: string[];
    source?: string;
    updatedAt?: number;
  };
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  requiredParams: string[];
  optionalParams?: string[];
  requiresApproval: boolean; // false = auto, true = needs confirm/approval
  execute: (params: Record<string, any>) => Promise<any>;
}

export interface Channel Adapter {
  id: ChannelId;
  parseWebhook: (payload: any) => Promise<AgentInput>;
  send: (message: AgentResponse) => Promise<void>;
  formatResponse: (response: string) => string; // Channel-specific formatting
  normalizePhoneNumber?: (phone: string) => string;
}

export interface ParsedIntent {
  action: IntentAction | null;
  params: Record<string, any>;
  confidence: number;
  method: "llm" | "regex" | "none";
}

export interface OrchestratorStep {
  id: number;
  name: string;
  description: string;
  execute: (input: StepInput) => Promise<StepOutput>;
}

export interface StepInput {
  businessId: string;
  userId: string;
  message: string;
  channelId: ChannelId;
  context: Partial<Trace>;
}

export interface StepOutput {
  success: boolean;
  data: any;
  error?: string;
  trace?: Partial<Trace>;
}
