/**
 * Santo AI Adapters - Channel Integration Layer
 *
 * Normalize messages from multiple channels (WhatsApp, Email, Web, etc.)
 * and format responses for each platform
 */

import type { AgentInput, AgentResponse, ChannelAdapter, ChannelId } from "../types";

/**
 * Base adapter class
 */
export abstract class BaseAdapter implements ChannelAdapter {
  id: ChannelId;

  constructor(channelId: ChannelId) {
    this.id = channelId;
  }

  abstract parseWebhook(payload: any): Promise<AgentInput>;
  abstract send(message: AgentResponse): Promise<void>;
  abstract formatResponse(response: string): string;
}

/**
 * WhatsApp Adapter
 * Integrates with Meta Cloud API for WhatsApp Business
 */
export class WhatsAppAdapter extends BaseAdapter {
  private phoneNumberId: string;
  private businessAccountId: string;
  private accessToken: string;

  constructor(config: {
    phoneNumberId: string;
    businessAccountId: string;
    accessToken: string;
  }) {
    super("whatsapp");
    this.phoneNumberId = config.phoneNumberId;
    this.businessAccountId = config.businessAccountId;
    this.accessToken = config.accessToken;
  }

  async parseWebhook(payload: any): Promise<AgentInput> {
    // Parse Meta webhook format
    const { entry } = payload;
    if (!entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
      throw new Error("Invalid WhatsApp webhook format");
    }

    const msg = entry[0].changes[0].value.messages[0];
    const contact = entry[0].changes[0].value.contacts[0];

    return {
      userId: contact.wa_id,
      message: msg.text?.body || "",
      channelId: "whatsapp",
      metadata: {
        timestamp: msg.timestamp,
        messageId: msg.id,
        phoneNumber: contact.wa_id,
      },
    };
  }

  async send(message: AgentResponse): Promise<void> {
    const formattedText = this.formatResponse(message.text);
    const payload = {
      messaging_product: "whatsapp",
      to: message.metadata?.phoneNumber,
      type: "text",
      text: { body: formattedText },
    };

    // In production: POST to /messages endpoint
    console.log("[WhatsApp] Would send:", payload);
  }

  formatResponse(response: string): string {
    // WhatsApp limits: 4096 chars, no HTML
    return response
      .replace(/<[^>]+>/g, "") // Strip HTML
      .slice(0, 4096)
      .trim();
  }
}

/**
 * Email Adapter
 * Integrates with email providers (SendGrid, AWS SES, etc.)
 */
export class EmailAdapter extends BaseAdapter {
  private fromEmail: string;
  private provider: "sendgrid" | "ses" | "smtp";

  constructor(config: {
    fromEmail: string;
    provider: "sendgrid" | "ses" | "smtp";
  }) {
    super("email");
    this.fromEmail = config.fromEmail;
    this.provider = config.provider;
  }

  async parseWebhook(payload: any): Promise<AgentInput> {
    // Parse email message (format depends on provider)
    return {
      userId: payload.from || "unknown",
      message: payload.text || "",
      channelId: "email",
      metadata: {
        timestamp: Date.now(),
        emailAddress: payload.from,
        subject: payload.subject,
      },
    };
  }

  async send(message: AgentResponse): Promise<void> {
    const payload = {
      to: message.metadata?.emailAddress,
      from: this.fromEmail,
      subject: "Re: Your message",
      html: this.formatResponse(message.text),
    };

    // In production: use email provider SDK
    console.log("[Email] Would send:", payload);
  }

  formatResponse(response: string): string {
    // Email can include HTML
    return `<p>${response.replace(/\n/g, "<br>")}</p>`;
  }
}

/**
 * Web Widget Adapter
 * For embeddable chat widget on websites
 */
export class WebWidgetAdapter extends BaseAdapter {
  constructor() {
    super("web");
  }

  async parseWebhook(payload: any): Promise<AgentInput> {
    return {
      userId: payload.visitorId,
      message: payload.message,
      channelId: "web",
      metadata: {
        timestamp: payload.timestamp || Date.now(),
        sessionId: payload.sessionId,
        url: payload.pageUrl,
      },
    };
  }

  async send(message: AgentResponse): Promise<void> {
    // In production: send via WebSocket or HTTP
    console.log("[Web] Would send response via WebSocket");
  }

  formatResponse(response: string): string {
    // Web can show formatted text with markdown
    return response;
  }
}

/**
 * SMS Adapter
 * For SMS/text message support
 */
export class SMSAdapter extends BaseAdapter {
  private twilioAccountSid: string;
  private twilioAuthToken: string;
  private fromNumber: string;

  constructor(config: {
    twilioAccountSid: string;
    twilioAuthToken: string;
    fromNumber: string;
  }) {
    super("sms");
    this.twilioAccountSid = config.twilioAccountSid;
    this.twilioAuthToken = config.twilioAuthToken;
    this.fromNumber = config.fromNumber;
  }

  async parseWebhook(payload: any): Promise<AgentInput> {
    return {
      userId: payload.From,
      message: payload.Body,
      channelId: "sms",
      metadata: {
        timestamp: Date.now(),
        phoneNumber: payload.From,
        messageId: payload.MessageSid,
      },
    };
  }

  async send(message: AgentResponse): Promise<void> {
    const formattedText = this.formatResponse(message.text);
    const payload = {
      To: message.metadata?.phoneNumber,
      From: this.fromNumber,
      Body: formattedText,
    };

    // In production: use Twilio SDK
    console.log("[SMS] Would send:", payload);
  }

  formatResponse(response: string): string {
    // SMS limits: 160 chars (or 1600 with concatenation)
    // Split into 160-char chunks if needed
    const maxChars = 160;
    if (response.length <= maxChars) {
      return response;
    }

    const chunks = [];
    for (let i = 0; i < response.length; i += maxChars) {
      chunks.push(response.slice(i, i + maxChars));
    }

    return chunks
      .map((chunk, i) => `[${i + 1}/${chunks.length}] ${chunk}`)
      .join("\n");
  }
}

/**
 * Create adapter from channel ID
 */
export function createAdapter(
  channelId: ChannelId,
  config: Record<string, any>
): ChannelAdapter {
  switch (channelId) {
    case "whatsapp":
      return new WhatsAppAdapter({
        phoneNumberId: config.phoneNumberId,
        businessAccountId: config.businessAccountId,
        accessToken: config.accessToken,
      });

    case "email":
      return new EmailAdapter({
        fromEmail: config.fromEmail,
        provider: config.provider || "sendgrid",
      });

    case "web":
      return new WebWidgetAdapter();

    case "sms":
      return new SMSAdapter({
        twilioAccountSid: config.twilioAccountSid,
        twilioAuthToken: config.twilioAuthToken,
        fromNumber: config.fromNumber,
      });

    default:
      throw new Error(`Unknown channel: ${channelId}`);
  }
}

// Export all adapters
export { WhatsAppAdapter, EmailAdapter, WebWidgetAdapter, SMSAdapter };
