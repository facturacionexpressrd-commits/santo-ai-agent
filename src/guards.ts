/**
 * Santo AI Guards - Response Validation & Guardrails
 *
 * Ensures AI responses:
 * - Don't invent prices/policies
 * - Respect business rules
 * - Include appropriate escalations
 * - Mask sensitive data
 */

import type { Trace, Rule } from "./types";

export interface GuardResult {
  valid: boolean;
  issues: string[];
  suggestions?: string[];
}

/**
 * Guard: Response doesn't invent prices
 */
export function guardNoPriceFabrication(
  response: string,
  trace: Trace
): GuardResult {
  const pricePattern = /\$\d+(?:\.\d{2})?|£\d+(?:\.\d{2})?|€\d+(?:\.\d{2})?/g;
  const matches = response.match(pricePattern) || [];

  if (matches.length === 0) {
    return { valid: true, issues: [] };
  }

  // Check if mentioned prices exist in knowledge base
  const hasKnowledgeOfPrices = trace.knowledgeRetrieved.some(
    (k) =>
      /price|cost|\$|\£|€/i.test(k) ||
      matches.some((price) => k.includes(price))
  );

  if (!hasKnowledgeOfPrices) {
    return {
      valid: false,
      issues: [
        `Response mentions prices ${matches.join(", ")} not in knowledge base`,
      ],
      suggestions: [
        "Remove price quotes",
        "Ask customer to check website for current pricing",
      ],
    };
  }

  return { valid: true, issues: [] };
}

/**
 * Guard: Response doesn't make false commitments
 */
export function guardNoFalseCommitments(
  response: string,
  trace: Trace
): GuardResult {
  const commitmentKeywords = [
    "guarantee",
    "promise",
    "will",
    "definitely",
    "100%",
    "always",
    "never fails",
  ];

  const hasCommitment = commitmentKeywords.some((keyword) =>
    response.toLowerCase().includes(keyword)
  );

  if (!hasCommitment) {
    return { valid: true, issues: [] };
  }

  // Check if commitment is backed by knowledge
  const backupKeywords = ["policy", "agreement", "contract", "terms"];
  const isBacked = backupKeywords.some(
    (k) =>
      response.toLowerCase().includes(k) &&
      trace.knowledgeRetrieved.some((kb) => kb.toLowerCase().includes(k))
  );

  if (!isBacked && trace.intent === "create_order") {
    return {
      valid: false,
      issues: ["Response makes commitments not supported by knowledge base"],
      suggestions: [
        "Qualify commitments with 'typically', 'usually', 'often'",
        "Escalate to human for guarantees",
      ],
    };
  }

  return { valid: true, issues: [] };
}

/**
 * Guard: PII masking
 */
export function guardMaskPII(response: string): GuardResult {
  // Patterns for common PII
  const patterns = {
    ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
    creditCard: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    apiKey: /sk-[a-zA-Z0-9]{48}/g,
    databaseUrl: /postgres:\/\/[^\s]+/g,
  };

  const issues: string[] = [];
  Object.entries(patterns).forEach(([type, pattern]) => {
    if (pattern.test(response)) {
      issues.push(`Contains ${type}`);
    }
  });

  return {
    valid: issues.length === 0,
    issues,
    suggestions: issues.length > 0 ? ["Mask or remove PII before sending"] : [],
  };
}

/**
 * Guard: Response length
 */
export function guardResponseLength(
  response: string,
  maxChars = 2000
): GuardResult {
  if (response.length <= maxChars) {
    return { valid: true, issues: [] };
  }

  return {
    valid: false,
    issues: [
      `Response too long: ${response.length} chars (max ${maxChars})`,
    ],
    suggestions: ["Truncate response", "Split into multiple messages"],
  };
}

/**
 * Guard: Profanity & inappropriate content
 */
export function guardNoInappropriateContent(response: string): GuardResult {
  // Simple keyword check (in production: use ML classifier)
  const inappropriateKeywords = [
    "hate",
    "discriminate",
    "illegal",
    "exploit",
    "abuse",
  ];

  const issues = inappropriateKeywords.filter((keyword) =>
    response.toLowerCase().includes(keyword)
  );

  return {
    valid: issues.length === 0,
    issues:
      issues.length > 0
        ? [`Contains inappropriate language: ${issues.join(", ")}`]
        : [],
    suggestions:
      issues.length > 0 ? ["Rephrase response to be professional"] : [],
  };
}

/**
 * Guard: Escalation appropriateness
 */
export function guardEscalationCheck(
  response: string,
  trace: Trace
): GuardResult {
  const escalationKeywords = [
    "specialist",
    "team",
    "manager",
    "support",
    "human",
  ];
  const mentionsEscalation = escalationKeywords.some((kw) =>
    response.toLowerCase().includes(kw)
  );

  // If confidence is low and no escalation mentioned, it's a problem
  if (trace.confidence < 0.6 && !mentionsEscalation && !trace.escalated) {
    return {
      valid: false,
      issues: ["Low confidence response should mention escalation"],
      suggestions: ["Add escalation message", "Mark as escalated in trace"],
    };
  }

  return { valid: true, issues: [] };
}

/**
 * Run all guards on a response
 */
export function runAllGuards(response: string, trace: Trace): GuardResult {
  const guards = [
    guardNoPriceFabrication(response, trace),
    guardNoFalseCommitments(response, trace),
    guardMaskPII(response),
    guardResponseLength(response),
    guardNoInappropriateContent(response),
    guardEscalationCheck(response, trace),
  ];

  const allIssues = guards.flatMap((g) => g.issues);
  const allSuggestions = guards.flatMap((g) => g.suggestions || []);

  return {
    valid: allIssues.length === 0,
    issues: allIssues,
    suggestions: [...new Set(allSuggestions)],
  };
}

/**
 * Apply custom business rules
 */
export function applyCustomRules(
  response: string,
  rules: Rule[]
): GuardResult {
  const issues: string[] = [];

  rules.forEach((rule) => {
    if (!rule.enabled) return;

    if (rule.kind === "never") {
      // Response should never contain these things
      if (response.toLowerCase().includes(rule.instruction.toLowerCase())) {
        issues.push(`Violates rule: ${rule.name}`);
      }
    } else if (rule.kind === "always") {
      // Response should always contain these things (if triggered)
      // Implementation depends on rule specifics
    }
  });

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Comprehensive validation pipeline
 */
export function validateResponse(
  response: string,
  trace: Trace,
  customRules?: Rule[]
): GuardResult {
  // Run all standard guards
  const guardResults = runAllGuards(response, trace);

  // Apply custom rules if provided
  let ruleResults: GuardResult = { valid: true, issues: [] };
  if (customRules && customRules.length > 0) {
    ruleResults = applyCustomRules(response, customRules);
  }

  return {
    valid: guardResults.valid && ruleResults.valid,
    issues: [...guardResults.issues, ...ruleResults.issues],
    suggestions: [
      ...(guardResults.suggestions || []),
      ...(ruleResults.suggestions || []),
    ],
  };
}

/**
 * Quarantine response if validation fails
 */
export function quarantineIfInvalid(
  response: string,
  trace: Trace,
  customRules?: Rule[]
): { approved: boolean; response: string } {
  const validation = validateResponse(response, trace, customRules);

  if (validation.valid) {
    return { approved: true, response };
  }

  // Return escalation message instead
  const escalationMessage =
    "I'd like to help, but I think it's best to connect you with our team. " +
    "Please hold while I route your request to a specialist who can give you " +
    "the most accurate information.";

  return { approved: false, response: escalationMessage };
}
