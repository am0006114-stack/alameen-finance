import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeArabic } from "./text";
import { runV3ArchiveSequence, type V3ArchiveSequenceResult } from "./archiveSequenceLab";

function riskScore(text: string) {
  const n = normalizeArabic(text);
  let score = 0;
  const rules: Array<[RegExp, number]> = [
    [/(الغاء|الغي|إلغاء|ملغي|الغى|الغيت)/, 12],
    [/(استرداد|استرجاع|رجعولي|رجعلي|فلوسي)/, 12],
    [/(نصب|نصاب|احتيال|محتال)/, 14],
    [/(فضح|انشر|نشر|فيسبوك|محامي|قضيه|قضية|شكوى|اشتكي)/, 14],
    [/(دفعت|حولت|وصل|وصلت|حواله|حوالة|دفع)/, 9],
    [/(غير.*جهاز|غير.*موديل|تغيير.*جهاز|ايفون|سامسونج|هونر|تكنو)/, 8],
    [/(عدل|تعديل|رقمي|اسمي|راتبي|ايميلي|الإيميل|الايميل)/, 8],
    [/(موظف|موضف|مدير|عمران)/, 7],
    [/(كفيل|ضامن)/, 6],
    [/(وين|متى|كم|ليش|كيف|شو|هل).*(وين|متى|كم|ليش|كيف|شو|هل)/, 5],
  ];
  for (const [re, points] of rules) if (re.test(n)) score += points;
  if ((text.match(/[؟?]/g) || []).length >= 2) score += 4;
  if (text.length > 120) score += 2;
  return score;
}

type Candidate = { id: string; wa_id: string; customer_message: string; source_created_at: string };

async function labEnabled() {
  const { data, error } = await supabaseAdmin.from("whatsapp_v3_lab_settings").select("value").eq("key", "lab_enabled").maybeSingle();
  if (error) throw new Error(`v3_lab_setting:${error.message}`);
  return String(data?.value || "false") === "true";
}

async function chooseRiskAnchors(limit: number) {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_v2_archive_cases")
    .select("id,wa_id,customer_message,source_created_at")
    .order("source_created_at", { ascending: false })
    .limit(800);
  if (error) throw new Error(`v3_archive_candidates:${error.message}`);

  const rows = (data || []) as Candidate[];
  const { data: prior, error: perr } = await supabaseAdmin
    .from("whatsapp_v3_archive_runs")
    .select("anchor_case_id")
    .order("created_at", { ascending: false })
    .limit(3000);
  if (perr) throw new Error(`v3_archive_prior:${perr.message}`);
  const used = new Set((prior || []).map((x: { anchor_case_id?: string | null }) => String(x.anchor_case_id || "")).filter(Boolean));

  const byConversation = new Map<string, Candidate & { score: number }>();
  for (const row of rows) {
    if (used.has(String(row.id))) continue;
    const scored = { ...row, score: riskScore(String(row.customer_message || "")) };
    const existing = byConversation.get(String(row.wa_id));
    if (!existing || scored.score > existing.score) byConversation.set(String(row.wa_id), scored);
  }

  return [...byConversation.values()]
    .sort((a, b) => b.score - a.score || new Date(b.source_created_at).getTime() - new Date(a.source_created_at).getTime())
    .slice(0, limit);
}

export type V3ArchiveBatchResult = {
  requestedSequences: number;
  completedSequences: number;
  failedSequences: number;
  totalTurns: number;
  averageV3Score: number;
  criticalFailures: number;
  continuityFailures: number;
  runs: Array<{ anchorCaseId: string; score: number; result?: V3ArchiveSequenceResult; error?: string }>;
};

export async function runV3RiskArchiveBatch(input?: { sequences?: number; maxTurns?: number }): Promise<V3ArchiveBatchResult> {
  if (!(await labEnabled())) throw new Error("v3_lab_disabled");
  const sequences = Math.max(1, Math.min(Number(input?.sequences || 3), 10));
  const maxTurns = Math.max(1, Math.min(Number(input?.maxTurns || 6), 12));
  const anchors = await chooseRiskAnchors(sequences);
  const runs: V3ArchiveBatchResult["runs"] = [];
  let turns = 0, scoreTotal = 0, completed = 0, failed = 0, critical = 0, continuity = 0;

  for (const anchor of anchors) {
    try {
      const result = await runV3ArchiveSequence({ anchorCaseId: anchor.id, maxTurns });
      runs.push({ anchorCaseId: anchor.id, score: anchor.score, result });
      completed++;
      turns += result.turnCount;
      scoreTotal += result.v3AverageScore * result.turnCount;
      critical += result.criticalFailureCount;
      continuity += result.continuityFailureCount;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      runs.push({ anchorCaseId: anchor.id, score: anchor.score, error: message });
      failed++;
      if (/budget|lab_disabled/i.test(message)) break;
    }
  }

  return {
    requestedSequences: sequences,
    completedSequences: completed,
    failedSequences: failed,
    totalTurns: turns,
    averageV3Score: turns ? Math.round((scoreTotal / turns) * 100) / 100 : 0,
    criticalFailures: critical,
    continuityFailures: continuity,
    runs,
  };
}
