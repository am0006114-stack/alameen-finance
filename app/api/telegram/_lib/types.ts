export type TelegramUser = {
  id: number | string;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
};

export type TelegramChat = {
  id: number | string;
  type?: string;
  first_name?: string;
  last_name?: string;
  username?: string;
};

export type TelegramPhotoSize = {
  file_id: string;
  file_unique_id?: string;
  width?: number;
  height?: number;
  file_size?: number;
};

export type TelegramFileAttachment = {
  file_id: string;
  file_unique_id?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
  duration?: number;
};

export type TelegramBusinessConnection = {
  id: string;
  user: TelegramUser;
  user_chat_id?: number | string;
  date?: number;
  is_enabled?: boolean;
  rights?: Record<string, unknown>;
};

export type TelegramMessage = {
  message_id: number;
  date?: number;
  business_connection_id?: string;
  from?: TelegramUser;
  sender_business_bot?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
  document?: TelegramFileAttachment;
  voice?: TelegramFileAttachment & { mime_type?: string };
  audio?: TelegramFileAttachment;
  video?: TelegramFileAttachment;
};

export type TelegramUpdate = {
  update_id: number;
  business_connection?: TelegramBusinessConnection;
  business_message?: TelegramMessage;
  edited_business_message?: TelegramMessage;
  deleted_business_messages?: {
    business_connection_id: string;
    chat: TelegramChat;
    message_ids: number[];
  };
};

export type TelegramCustomerLink = {
  business_connection_id: string;
  telegram_chat_id: string;
  telegram_user_id: string | null;
  canonical_wa_id: string;
  application_id: string | null;
  tracking_id: string | null;
  ai_paused_until: string | null;
  linked_at: string;
};

export type TelegramMediaRecord = {
  kind: "photo" | "voice" | "audio" | "document" | "video";
  fileId: string;
  fileUniqueId: string | null;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  storagePath: string | null;
  transcript: string | null;
  requiresHuman: boolean;
  warning: string | null;
};
