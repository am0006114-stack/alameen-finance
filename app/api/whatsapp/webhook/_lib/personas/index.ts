import { abdullahPersona } from "./abdullah";
import { abdulrahmanPersona } from "./abdulrahman";
import { fidwaPersona } from "./fidwa";
import { omranPersona } from "./omran";
import { talaPersona } from "./tala";
import type { AgentName, AgentPersona } from "./types";

export type { AgentName, AgentPersona, AgentRole } from "./types";

const PERSONAS: Record<AgentName, AgentPersona> = {
  فدوة: fidwaPersona,
  تالا: talaPersona,
  عبدالله: abdullahPersona,
  عبدالرحمن: abdulrahmanPersona,
  عمران: omranPersona,
};

export function getAgentPersona(name: AgentName) {
  return PERSONAS[name];
}
