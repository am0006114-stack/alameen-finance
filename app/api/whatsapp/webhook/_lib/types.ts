export type ApplicationRecord = {
  id: string;
  created_at?: string | null;
  tracking_id?: string | null;
  full_name?: string | null;
  phone?: string | null;
  status?: string | null;
  payment_status?: string | null;
  payment_confirmed_at?: string | null;
  payment_reference?: string | null;
  device_name?: string | null;
  salary?: number | string | null;
  delivery_delay_until?: string | null;
};

export type WhatsAppMessage = {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;

  text?: { body?: string };

  image?: {
    id?: string;
    caption?: string;
    mime_type?: string;
    sha256?: string;
  };

  document?: {
    id?: string;
    caption?: string;
    filename?: string;
    mime_type?: string;
    sha256?: string;
  };

  audio?: {
    id?: string;
    mime_type?: string;
    sha256?: string;
    voice?: boolean;
  };

  voice?: {
    id?: string;
    mime_type?: string;
    sha256?: string;
  };

  video?: {
    id?: string;
    caption?: string;
    mime_type?: string;
    sha256?: string;
  };

  sticker?: {
    id?: string;
    mime_type?: string;
    sha256?: string;
    animated?: boolean;
    emoji?: string;
  };

  location?: {
    latitude?: number;
    longitude?: number;
    name?: string;
    address?: string;
  };

  contacts?: Array<{
    name?: {
      formatted_name?: string;
      first_name?: string;
      last_name?: string;
    };
    phones?: Array<{
      phone?: string;
      type?: string;
      wa_id?: string;
    }>;
  }>;

  interactive?: {
    type?: string;
    button_reply?: {
      id?: string;
      title?: string;
    };
    list_reply?: {
      id?: string;
      title?: string;
      description?: string;
    };
  };

  button?: {
    text?: string;
    payload?: string;
  };

  reaction?: {
    message_id?: string;
    emoji?: string;
  };

  [key: string]: unknown;
};

export type WhatsAppWebhookBody = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
        messages?: WhatsAppMessage[];
        statuses?: unknown[];
      };
    }>;
  }>;
};

export type CustomerIntent =
  | "abuse"
  | "legal_threat"
  | "social_media_threat"
  | "scam_accusation"
  | "trust_verification"
  | "payment_dispute"
  | "device_delay_rage"
  | "emotional_pressure"
  | "media_upload"
  | "document_upload"
  | "document_followup"
  | "reaction"
  | "complaint"
  | "refund"
  | "continue_decision"
  | "keep_request"
  | "decline_decision"
  | "cancel_request"
  | "cancel_refund_request"
  | "cancel_confirmed"
  | "alternative_payment_source"
  | "receipt_upload_needed"
  | "receipt_upload_confirmation"
  | "supplier_delay_question"
  | "office_pickup_policy"
  | "site_issue"
  | "human_agent"
  | "staff_identity"
  | "system_prompt_request"
  | "call_request"
  | "device_change"
  | "device_change_cancelled"
  | "device_change_confirmed"
  | "payment_amount"
  | "payment_method"
  | "payment_timing"
  | "payment_recipient"
  | "payment_next_step"
  | "payment_review_time"
  | "payment_objection"
  | "payment_link_issue"
  | "reopen_cancelled_request"
  | "reopen_cancelled_confirmed"
  | "loan"
  | "contact_info"
  | "website"
  | "tracking_link_request"
  | "location"
  | "installment_info"
  | "requirements"
  | "application_data_correction"
  | "application_data_correction_confirmed"
  | "self_employed"
  | "apply"
  | "products"
  | "payment"
  | "payment_trust_question"
  | "delivery"
  | "review_time"
  | "order_status"
  | "greeting"
  | "thanks"
  | "unknown";

export type AiReplyInput = {
  customerText: string;
  deterministicReply: string;
  customerName?: string;
  trackingId?: string;
  status?: string | null;
  paymentStatus?: string | null;
  deviceName?: string | null;
  isSensitive: boolean;
  hasApplication: boolean;
  intent: CustomerIntent;
  conversationContext?: string;
  lastAssistantReplies?: string[];
  lastCustomerMessages?: string[];
  memoryTrackingId?: string | null;
  messageType?: string | null;
  sentUrls?: string[];
  hasRecentConversation?: boolean;
  hasRecentStaffIntro?: boolean;
  assignedAgentName?: string | null;
  lastMeaningfulCustomerMessage?: string | null;
  lastQuestionLikeCustomerMessage?: string | null;
};
