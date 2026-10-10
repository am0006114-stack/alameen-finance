import type { V3TextProvider } from "../v3-os/provider";
import { createV4ModelAdapter } from "./modelAdapter";
import { buildJourneyDirectorDraft, JOURNEY_DIRECTOR_NOTE, resolveJourneyDirectorUnderstanding } from "./journeyDirector";
import type { V4ModelAdapter } from "./types";

/**
 * V4.1 puts deterministic current-turn/journey handling in front of paid model calls.
 * The base V4 model remains available for genuinely open-ended conversation, but it no
 * longer owns revenue steps, document upload, action confirmations, tracking gates,
 * status boilerplate, or other high-risk routine turns.
 */
export function createV41JourneyAwareModelAdapter(input: {
  understandingProvider: V3TextProvider;
  writerProvider: V3TextProvider;
  criticProvider: V3TextProvider;
}): V4ModelAdapter {
  const base = createV4ModelAdapter(input);

  return {
    async understand(req) {
      const directed = resolveJourneyDirectorUnderstanding(req);
      return directed || base.understand(req);
    },

    async compose(req) {
      const directed = buildJourneyDirectorDraft({
        burstText: req.burstText,
        understanding: req.understanding,
        memory: req.memory,
        truth: req.truth,
      });
      return directed || base.compose(req);
    },

    async critique(req) {
      if (req.draft.notes.includes(JOURNEY_DIRECTOR_NOTE)) {
        return { accepted: true, score: 1, reasons: [], repairInstructions: [] };
      }
      return base.critique(req);
    },
  };
}
