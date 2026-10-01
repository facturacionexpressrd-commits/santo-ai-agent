/**
 * Santo AI Agent - Main Entry Point
 *
 * Production-grade omnichannel AI orchestrator for business CRM & messaging
 */

// Types
export type {
  AgentConfig,
  AgentInput,
  AgentResponse,
  Trace,
  Message,
  CustomerProfile,
  BusinessHours,
  Rule,
  Document,
  Tool,
  ChannelAdapter,
  ParsedIntent,
  IntentAction,
  BusinessType,
  ChannelId,
  PermissionLevel,
} from "./types";

// Orchestrator
export { OrchestratorAgent, createAgent } from "./orchestrator";

// Tools
export {
  knowledgeRetrievalTool,
  crmCreateContactTool,
  crmScoreLeadTool,
  crmLogInteractionTool,
  schedulingCheckAvailabilityTool,
  schedulingBookAppointmentTool,
  schedulingCancelAppointmentTool,
  emailSendTool,
  notificationScheduleFollowupTool,
  inventoryCheckStockTool,
  orderCreateTool,
  allTools,
  getToolsForBusinessType,
  getToolPermission,
} from "./tools";

// Guards
export {
  guardNoPriceFabrication,
  guardNoFalseCommitments,
  guardMaskPII,
  guardResponseLength,
  guardNoInappropriateContent,
  guardEscalationCheck,
  runAllGuards,
  applyCustomRules,
  validateResponse,
  quarantineIfInvalid,
} from "./guards";

// Version
export const VERSION = "1.0.0";

// Quick start function
export function quickStart(config: {
  businessId: string;
  businessType: string;
  apiKey: string;
  knowledgeBase: string[];
}) {
  const { createAgent: createAgentImpl } = require("./orchestrator");

  return createAgentImpl({
    businessId: config.businessId,
    businessType: config.businessType,
    apiKey: config.apiKey,
    knowledgeBase: config.knowledgeBase,
    confidenceThreshold: 0.7,
    onError: (error: Error, context: any) => {
      console.error("[SantoAI] Error:", error.message, context);
    },
  });
}

// Default export
export default {
  VERSION,
  quickStart,
};
