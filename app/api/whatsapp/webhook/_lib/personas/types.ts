export type AgentRole = "followup" | "study" | "escalation";

export type AgentName = "فدوة" | "تالا" | "عبدالله" | "عبدالرحمن" | "عمران";

export type AgentPersona = {
  name: AgentName;
  role: AgentRole;
  grammaticalGender: "female" | "male";
  tone: string;
  empathy: "medium" | "high";
  replyLength: "short" | "medium";
  openingStyle: string;
  decisionStyle: string;
  strengths: string[];
  avoid: string[];
};
