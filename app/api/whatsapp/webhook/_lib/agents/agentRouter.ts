import type { ConversationMemory } from "../conversationMemory";
import type { ApplicationRecord, CustomerIntent } from "../types";
import { digitsOnly } from "../text";
import type { AgentName, AgentRole } from "../personas";
import { buildFollowupAgentInstructions, buildFollowupFallback } from "./followupAgent";
import { buildStudyAgentInstructions, buildStudyFallback } from "./studyAgent";

export type AgentResolution = {
  name: AgentName;
  role: AgentRole;
  reason: string;
  sessionActive: boolean;
};

const STUDY_INTENTS: CustomerIntent[] = [
  "requirements",
  "self_employed",
  "application_data_correction",
  "application_data_correction_confirmed",
  "document_upload",
  "document_followup",
];

const STUDY_STATUSES = new Set([
  "needs_guarantor",
  "guarantor_submitted",
  "needs_salary_slip",
  "salary_slip_uploaded",
  "needs_identity",
  "identity_requested",
  "identity_uploaded",
]);

function pickStableName(seed: string, names: AgentName[]) {
  const digits = digitsOnly(seed);
  const index = Number(digits.slice(-2) || "0") % names.length;
  return names[index];
}

function isRecentSameRole(memory: ConversationMemory, role: AgentRole) {
  return Boolean(memory.agentSessionActive && memory.lastAgentRole === role && memory.lastAgentName);
}

export function resolveAgentForTurn(input: {
  from: string;
  intent: CustomerIntent;
  memory: ConversationMemory;
  app?: ApplicationRecord | null;
  omranActive: boolean;
  omranReason?: string | null;
}): AgentResolution {
  if (input.omranActive || input.memory.managerSessionActive) {
    return {
      name: "عمران",
      role: "escalation",
      reason: input.omranReason || "manager_session",
      sessionActive: true,
    };
  }

  const studyByIntent = STUDY_INTENTS.includes(input.intent);
  const studyByStatus = Boolean(input.app?.status && STUDY_STATUSES.has(String(input.app.status)));
  const neutralContinuity = ["greeting", "thanks", "unknown"].includes(String(input.intent));

  if (
    neutralContinuity &&
    input.memory.agentSessionActive &&
    input.memory.lastAgentName &&
    input.memory.lastAgentRole &&
    input.memory.lastAgentRole !== "escalation"
  ) {
    return {
      name: input.memory.lastAgentName,
      role: input.memory.lastAgentRole,
      reason: "neutral_turn_continuity",
      sessionActive: true,
    };
  }

  const role: AgentRole = studyByIntent || studyByStatus ? "study" : "followup";

  if (isRecentSameRole(input.memory, role)) {
    return {
      name: input.memory.lastAgentName as AgentName,
      role,
      reason: "continue_same_agent",
      sessionActive: true,
    };
  }

  if (role === "study") {
    return {
      name: pickStableName(input.from, ["عبدالله", "عبدالرحمن"]),
      role,
      reason: studyByIntent ? "study_intent" : "study_status",
      sessionActive: false,
    };
  }

  return {
    name: pickStableName(input.from, ["فدوة", "تالا"]),
    role,
    reason: "general_followup",
    sessionActive: false,
  };
}

export function buildAgentSystemInstructions(input: import("../types").AiReplyInput) {
  if (input.activeAgentRole === "study") return buildStudyAgentInstructions(input);
  if (input.activeAgentRole === "followup") return buildFollowupAgentInstructions(input);
  return "";
}

export function buildAgentFallbackReply(input: import("../types").AiReplyInput) {
  if (input.activeAgentRole === "study") return buildStudyFallback(input);
  return buildFollowupFallback(input);
}
