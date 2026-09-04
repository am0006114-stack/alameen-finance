import { fadwaPersona } from "./fadwa";
import { talaPersona } from "./tala";
import { abdullahPersona } from "./abdullah";
import { abdulrahmanPersona } from "./abdulrahman";
import { imranPersona } from "./imran";
import { khaledPersona } from "./khaled";

const all = [fadwaPersona, talaPersona, abdullahPersona, abdulrahmanPersona, imranPersona, khaledPersona];

export function personaWritingContract(roleName: string) {
  const normalized = String(roleName || "").replace(/\s+/g, "").toLowerCase();
  const persona = all.find((p) => normalized.includes(p.name.replace(/\s+/g, "").toLowerCase()));
  const selected = persona || abdullahPersona;
  return `PERSONA_MISSION=${selected.mission}\nPERSONA_VOICE:\n- ${selected.voice.join("\n- ")}`;
}
