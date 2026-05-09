"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";

type UploadKey = "guarantorIdFront" | "guarantorIdBack";

type ApplicationRecord = {
  id: string;
  tracking_id: string | null;
  phone: string | null;
  full_name: string | null;
  status: string | null;
};

const uploadTypes: { key: UploadKey; type: string; label: string }[] = [
  {
    key: "guarantorIdFront",
    type: "guarantor_front",
    label: "هوية الكفيل — الوجه الأمامي",
  },
  {
    key: "guarantorIdBack",
    type: "guarantor_back",
    label: "هوية الكفيل — الوجه الخلفي",
  },
];

const relationshipOptions = [
  { value: "", label: "اختر صلة القرابة" },
  { value: "father", label: "الأب" },
  { value: "mother", label: "الأم" },
  { value: "brother", label: "الأخ" },
  { value: "sister", label: "الأخت" },
  { value: "son", label: "الابن" },
  { value: "daughter", label: "الابنة" },
  { value: "spouse", label: "الزوج / الزوجة" },
  { value: "relative", label: "قريب" },
  { value: "friend", label: "صديق / معرفة" },
  { value: "other", label: "غير ذلك" },
];

function translateRelationship(value: string) {
  const found = relationshipOptions.find((item) => item.value === value);
  return found?.label || value || "";
}

export default function GuarantorClient() {
  const searchParams = useSearchParams();

  const tracking = searchParams.get("tracking") || "";
  const phoneFromUrl = searchParams.get("phone") || "";

  const [application, setApplication] = useState<ApplicationRecord | null>(null);
  const [isLoadingApplication, setIsLoadingApplication] = useState(true);
  const [applicationError, setApplicationError] = useState("");

  const [guarantorName, setGuarantorName] = useState("");
  const [guarantorNationalId, setGuarantorNationalId] = useState("");
  const [guarantorPhone, setGuarantorPhone] = useState("");
  const [guarantorEmployer, setGuarantorEmployer] = useState("");
  const [guarantorRelationship, setGuarantorRelationship] = useState("");
  const [guarantorSocialSecurity, setGuarantorSocialSecurity] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [files, setFiles] = useState<Record<UploadKey, File | null>>({
    guarantorIdFront: null,
    guarantorIdBack: null,
  });

  const [previewUrls, setPreviewUrls] = useState<Record<UploadKey, string>>({
    guarantorIdFront: "",
    guarantorIdBack: "",
  });

  const [progress, setProgress] = useState<Record<UploadKey, number>>({
    guarantorIdFront: 0,
    guarantorIdBack: 0,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionStep, setSubmissionStep] = useState("");
  const [submissionProgress, setSubmissionProgress] = useState(0);
  const [completed, setCompleted] = useState(false);

  const inputClass =
    "w-full rounded-2xl border border-[rgba(214,181,107,0.16)] bg-[rgba(3,18,14,0.58)] p-4 text-white outline-none transition placeholder:text-[#8d998f] focus:border-[#d6b56b] focus:ring-4 focus:ring-[#d6b56b]/10";

  const labelBoxClass =
    "flex items-center gap-3 rounded-2xl border border-[rgba(214,181,107,0.16)] bg-[rgba(255,255,255,0.04)] p-4 text-[#d7ddd5]";

  function cleanDigits(value: string) {
    return value.replace(/\D/g, "");
  }

  function validJordanPhone(value: string) {
    return /^(079|078|077)[0-9]{7}$/.test(value);
  }

  function validNationalId(value: string) {
    return /^[92][0-9]{9}$/.test(value);
  }

  function updateSubmissionStatus(message: string, percent: number) {
    setSubmissionStep(message);
    setSubmissionProgress(Math.max(0, Math.min(100, percent)));
  }

  async function uploadFile(file: File, path: string) {
    const { error } = await supabase.storage
      .from("documents")
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) throw error;

    const { data } = supabase.storage.from("documents").getPublicUrl(path);

    return data.publicUrl;
  }

  function handleFileChange(key: UploadKey, file: File | null) {
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png"];
    const maxSize = 5 * 1024 * 1024;

    if (!allowedTypes.includes(file.type)) {
      alert("يُسمح فقط برفع صور JPG أو PNG");
      return;
    }

    if (file.size > maxSize) {
      alert("حجم الصورة يجب ألا يتجاوز 5MB");
      return;
    }

    setPreviewUrls((prev) => {
      if (prev[key]) URL.revokeObjectURL(prev[key]);

      return {
        ...prev,
        [key]: URL.createObjectURL(file),
      };
    });

    setFiles((prev) => ({ ...prev, [key]: file }));
    setProgress((prev) => ({ ...prev, [key]: 0 }));

    let value = 0;

    const interval = window.setInterval(() => {
      value += 10;

      setProgress((prev) => ({
        ...prev,
        [key]: value > 100 ? 100 : value,
      }));

      if (value >= 100) {
        window.clearInterval(interval);
      }
    }, 80);
  }

  function removeFile(key: UploadKey) {
    setPreviewUrls((prev) => {
      if (prev[key]) URL.revokeObjectURL(prev[key]);

      return {
        ...prev,
        [key]: "",
      };
    });

    setFiles((prev) => ({ ...prev, [key]: null }));
    setProgress((prev) => ({ ...prev, [key]: 0 }));
  }

  useEffect(() => {
    async function loadApplication() {
      setIsLoadingApplication(true);
      setApplicationError("");

      try {
        const cleanTracking = tracking.trim();
        const cleanPhone = cleanDigits(phoneFromUrl);

        if (!cleanTracking || !cleanPhone) {
          setApplicationError("رابط الكفيل غير مكتمل. يرجى طلب رابط جديد من الإدارة.");
          setIsLoadingApplication(false);
          return;
        }

        const { data, error } = await supabase
          .from("applications")
          .select("id, tracking_id, phone, full_name, status")
          .eq("tracking_id", cleanTracking)
          .eq("phone", cleanPhone)
          .single();

        if (error || !data) {
          setApplicationError(
            "لم يتم العثور على الطلب. تأكد من فتح الرابط الصحيح المرسل من الإدارة."
          );
          setIsLoadingApplication(false);
          return;
        }

        setApplication(data as ApplicationRecord);
      } catch (error) {
        console.error(error);
        setApplicationError("حدث خطأ أثناء جلب بيانات الطلب. حاول مرة أخرى.");
      } finally {
        setIsLoadingApplication(false);
      }
    }

    loadApplication();
  }, [tracking, phoneFromUrl]);

  useEffect(() => {
    return () => {
      Object.values(previewUrls).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, [previewUrls]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (isSubmitting) return;

    if (!application) {
      return alert("لا يوجد طلب مرتبط بهذا الرابط.");
    }

    const cleanGuarantorPhone = cleanDigits(guarantorPhone);
    const cleanGuarantorNationalId = cleanDigits(guarantorNationalId);

    if (guarantorName.trim().split(/\s+/).length < 4) {
      return alert("اسم الكفيل يجب أن يكون رباعياً.");
    }

    if (!validNationalId(cleanGuarantorNationalId)) {
      return alert("الرقم الوطني للكفيل يجب أن يبدأ بـ 9 أو 2 وأن يكون 10 أرقام.");
    }

    if (!validJordanPhone(cleanGuarantorPhone)) {
      return alert("رقم هاتف الكفيل يجب أن يبدأ بـ 079 أو 078 أو 077 وأن يكون 10 أرقام.");
    }

    if (!guarantorRelationship) {
      return alert("يرجى اختيار صلة القرابة أو العلاقة مع الكفيل.");
    }

    if (!files.guarantorIdFront || !files.guarantorIdBack) {
      return alert("يرجى رفع صورة هوية الكفيل من الأمام والخلف.");
    }

    if (!termsAccepted) {
      return alert("يرجى الموافقة على الإقرار قبل إرسال بيانات الكفيل.");
    }

    setIsSubmitting(true);
    updateSubmissionStatus("جاري تجهيز بيانات الكفيل...", 10);

    try {
      updateSubmissionStatus("جاري تحديث طلب العميل...", 30);

      const { error: updateError } = await supabase
        .from("applications")
        .update({
          guarantor_name: guarantorName.trim(),
          guarantor_phone: cleanGuarantorPhone,
          guarantor_national_id: cleanGuarantorNationalId,
          guarantor_relationship: translateRelationship(guarantorRelationship),
          guarantor_social_security: guarantorSocialSecurity,
          status: "guarantor_submitted",
        })
        .eq("id", application.id);

      if (updateError) throw updateError;

      updateSubmissionStatus("جاري رفع صور هوية الكفيل...", 50);

      for (const [index, item] of uploadTypes.entries()) {
        const file = files[item.key];

        if (!file) continue;

        updateSubmissionStatus(
          `جاري رفع الوثائق (${index + 1} من ${uploadTypes.length})...`,
          50 + Math.round(((index + 1) / uploadTypes.length) * 35)
        );

        const extension = file.type === "image/png" ? "png" : "jpg";
        const path = `${application.tracking_id || application.id}/${item.type}-${Date.now()}.${extension}`;
        const publicUrl = await uploadFile(file, path);

        const { error: docError } = await supabase.from("documents").insert({
          application_id: application.id,
          type: item.type,
          file_url: publicUrl,
        });

        if (docError) throw docError;
      }

      updateSubmissionStatus("تم إرسال بيانات الكفيل بنجاح.", 100);
      await new Promise((resolve) => window.setTimeout(resolve, 1200));

      setCompleted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error(error);
      alert("صار خطأ أثناء حفظ بيانات الكفيل أو رفع الصور. حاول مرة ثانية.");
    } finally {
      setIsSubmitting(false);
      setSubmissionStep("");
      setSubmissionProgress(0);
    }
  }

  if (isLoadingApplication) {
    return (
      <main
        dir="rtl"
        className="min-h-screen bg-[#03120e] px-4 py-10 text-white"
      >
        <div className="mx-auto max-w-3xl rounded-[2rem] border border-[rgba(214,181,107,0.18)] bg-[rgba(3,18,14,0.74)] p-8 text-center shadow-2xl">
          <div className="mx-auto mb-5 h-14 w-14 animate-spin rounded-full border-4 border-[#69d97b] border-t-transparent" />
          <h1 className="text-2xl font-black">جاري التحقق من رابط الكفيل...</h1>
          <p className="mt-3 text-sm leading-7 text-[#d7ddd5]">
            يرجى الانتظار قليلاً.
          </p>
        </div>
      </main>
    );
  }

  if (applicationError) {
    return (
      <main
        dir="rtl"
        className="min-h-screen bg-[#03120e] px-4 py-10 text-white"
      >
        <div className="mx-auto max-w-3xl rounded-[2rem] border border-red-400/30 bg-red-950/25 p-8 text-center shadow-2xl">
          <h1 className="text-2xl font-black text-red-100">تعذر فتح النموذج</h1>
          <p className="mt-4 leading-8 text-red-100">{applicationError}</p>
          <Link
            href="/"
            className="mt-6 inline-flex rounded-2xl border border-[rgba(214,181,107,0.26)] bg-[rgba(214,181,107,0.10)] px-6 py-3 font-black text-[#f3dfac]"
          >
            العودة للرئيسية
          </Link>
        </div>
      </main>
    );
  }

  if (completed) {
    return (
      <main
        dir="rtl"
        className="min-h-screen bg-[#03120e] px-4 py-10 text-white"
      >
        <div className="mx-auto max-w-3xl rounded-[2rem] border border-[rgba(105,217,123,0.32)] bg-[rgba(3,18,14,0.82)] p-8 text-center shadow-2xl">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[#69d97b] text-4xl text-black">
            ✓
          </div>

          <div className="mb-4 inline-flex rounded-full border border-[rgba(105,217,123,0.32)] bg-[rgba(105,217,123,0.10)] px-4 py-2 text-sm text-[#b8f3c0]">
            تم إرسال بيانات الكفيل بنجاح
          </div>

          <h1 className="text-4xl font-black">اكتملت بيانات الكفيل</h1>

          <p className="mx-auto mt-4 max-w-2xl leading-8 text-[#d7ddd5]">
            تم حفظ بيانات الكفيل وربطها بطلب العميل. ستقوم الإدارة بمراجعة
            المعلومات والوثائق ثم التواصل مع مقدم الطلب عبر واتساب.
          </p>

          <div className="mt-8 rounded-2xl border border-[rgba(214,181,107,0.16)] bg-[rgba(3,18,14,0.74)] p-5 text-right">
            <p className="text-sm text-[#aeb9af]">رقم التتبع</p>
            <p className="mt-2 break-words text-2xl font-black text-[#f3dfac]">
              {application?.tracking_id || tracking}
            </p>
          </div>

          <Link
            href="/"
            className="green-button mt-8 inline-flex rounded-2xl px-8 py-4 text-base font-black transition"
          >
            العودة للرئيسية
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main
      dir="rtl"
      className="relative min-h-screen overflow-x-hidden bg-[#03120e] px-4 py-10 text-white [padding-top:calc(2.5rem+env(safe-area-inset-top))]"
    >
      {isSubmitting && (
        <SubmittingOverlay
          message={submissionStep}
          progress={submissionProgress}
        />
      )}

      <div className="mx-auto max-w-4xl">
        <section className="site-shell pattern-lines mb-8 rounded-[2rem] p-8 shadow-2xl">
          <div className="gold-chip mb-4 inline-flex rounded-full px-4 py-2 text-sm font-black">
            الأمين للأقساط والتمويل
          </div>

          <h1 className="text-4xl font-black leading-tight md:text-5xl">
            إدخال بيانات الكفيل
          </h1>

          <p className="mt-4 max-w-2xl leading-8 text-[#d7ddd5]">
            هذا الرابط مخصص لاستكمال بيانات الكفيل للطلب رقم{" "}
            <strong className="text-[#f3dfac]">
              {application?.tracking_id || tracking}
            </strong>
            . يرجى إدخال البيانات بدقة ورفع صور هوية الكفيل بوضوح.
          </p>

          <div className="mt-5 rounded-2xl border border-[rgba(105,217,123,0.24)] bg-[rgba(105,217,123,0.08)] p-4 text-sm font-bold leading-7 text-[#b8f3c0]">
            بيانات الكفيل تستخدم فقط لاستكمال دراسة طلب التمويل ولا تُستخدم لأي
            غرض تسويقي أو إعلان عام.
          </div>
        </section>

        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="glass-panel gold-outline rounded-3xl p-5 shadow-2xl">
            <h2 className="mb-4 text-2xl font-bold">1. بيانات الكفيل</h2>

            <div className="space-y-4">
              <input
                className={inputClass}
                placeholder="اسم الكفيل الرباعي"
                value={guarantorName}
                onChange={(e) => setGuarantorName(e.target.value)}
                autoComplete="name"
              />

              <input
                className={inputClass}
                placeholder="الرقم الوطني للكفيل: يبدأ بـ 9 أو 2 — 10 أرقام"
                inputMode="numeric"
                maxLength={10}
                value={guarantorNationalId}
                onChange={(e) =>
                  setGuarantorNationalId(cleanDigits(e.target.value).slice(0, 10))
                }
                autoComplete="off"
              />

              <input
                className={inputClass}
                placeholder="رقم هاتف الكفيل: 079 / 078 / 077"
                inputMode="tel"
                maxLength={10}
                value={guarantorPhone}
                onChange={(e) =>
                  setGuarantorPhone(cleanDigits(e.target.value).slice(0, 10))
                }
                autoComplete="tel"
              />

              <input
                className={inputClass}
                placeholder="مكان عمل الكفيل / طبيعة العمل — اختياري"
                value={guarantorEmployer}
                onChange={(e) => setGuarantorEmployer(e.target.value)}
                autoComplete="organization"
              />

              <select
                className={inputClass}
                value={guarantorRelationship}
                onChange={(e) => setGuarantorRelationship(e.target.value)}
              >
                {relationshipOptions.map((option) => (
                  <option key={option.value || "empty"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <label className={labelBoxClass}>
                <input
                  type="checkbox"
                  checked={guarantorSocialSecurity}
                  onChange={(e) => setGuarantorSocialSecurity(e.target.checked)}
                />
                <span>الكفيل مشترك بالضمان الاجتماعي</span>
              </label>
            </div>
          </section>

          <section className="glass-panel gold-outline rounded-3xl p-5 shadow-2xl">
            <h2 className="mb-2 text-2xl font-bold">2. رفع هوية الكفيل</h2>

            <p className="mb-5 text-sm leading-7 text-[#d7ddd5]">
              ارفع صورة هوية الكفيل من الأمام والخلف. يجب أن تكون الصورة واضحة،
              كاملة، وغير مقصوصة.
            </p>

            <div className="grid gap-4 md:grid-cols-2">
              {uploadTypes.map((item) => {
                const file = files[item.key];
                const percent = progress[item.key];
                const previewUrl = previewUrls[item.key];

                return (
                  <div
                    key={item.key}
                    className="rounded-2xl border border-[rgba(214,181,107,0.16)] bg-[rgba(255,255,255,0.035)] p-4"
                  >
                    <label className="mb-3 block font-bold">{item.label}</label>

                    <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-[rgba(214,181,107,0.34)] bg-[rgba(3,18,14,0.50)] p-5 text-center transition hover:bg-[rgba(2,18,14,0.92)]">
                      <span className="text-base font-black text-[#f3dfac]">
                        اختيار صورة أو تصوير الهوية
                      </span>

                      <span className="mt-2 text-xs leading-6 text-[#aeb9af]">
                        JPG أو PNG — الحد الأقصى 5MB لكل صورة.
                      </span>

                      <input
                        type="file"
                        accept="image/png,image/jpeg"
                        onChange={(e) =>
                          handleFileChange(item.key, e.target.files?.[0] || null)
                        }
                        className="hidden"
                      />
                    </label>

                    {file && (
                      <div className="mt-4 space-y-3">
                        {previewUrl && (
                          <div className="overflow-hidden rounded-2xl border border-[rgba(214,181,107,0.20)] bg-[rgba(2,18,14,0.92)]">
                            <img
                              src={previewUrl}
                              alt={item.label}
                              className="max-h-72 w-full object-contain"
                            />
                          </div>
                        )}

                        <p className="break-words text-sm text-[#d7ddd5]">
                          {file.name} — {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>

                        <div className="h-3 w-full overflow-hidden rounded-full bg-[rgba(214,181,107,0.14)]">
                          <div
                            className="h-full bg-gradient-to-l from-[#d6b56b] to-[#69d97b] transition-all duration-300"
                            style={{ width: `${percent}%` }}
                          />
                        </div>

                        <p className="text-sm text-[#f3dfac]">
                          {percent < 100
                            ? `جارٍ تجهيز الملف... ${percent}%`
                            : "اكتمل 100% ✅"}
                        </p>

                        <button
                          type="button"
                          onClick={() => removeFile(item.key)}
                          className="rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-2 text-sm font-black text-red-300 transition hover:bg-red-950"
                        >
                          حذف وإعادة التصوير / الرفع
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="glass-panel gold-outline rounded-3xl p-5 shadow-2xl">
            <h2 className="mb-4 text-2xl font-bold">3. الإقرار</h2>

            <label className="flex items-start gap-3 rounded-2xl border border-[rgba(214,181,107,0.24)] bg-[rgba(214,181,107,0.07)] p-4 leading-7">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-2"
              />

              <span>
                أقرّ بأن بيانات الكفيل والوثائق المرفوعة صحيحة، وأوافق على
                استخدامها فقط لغرض دراسة طلب التمويل واستكمال ملف العميل.
              </span>
            </label>
          </section>

          <button
            disabled={isSubmitting}
            className="green-button sticky bottom-4 w-full rounded-2xl p-5 text-lg font-black shadow-2xl disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "جاري إرسال بيانات الكفيل..." : "إرسال بيانات الكفيل"}
          </button>
        </form>
      </div>
    </main>
  );
}

function SubmittingOverlay({
  message,
  progress,
}: {
  message: string;
  progress: number;
}) {
  const safeProgress = Math.max(8, Math.min(100, Math.round(progress || 8)));

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#03120e]/95 px-4 backdrop-blur-xl">
      <div className="w-full max-w-md rounded-[2rem] border border-[rgba(214,181,107,0.30)] bg-[rgba(3,18,14,0.96)] p-7 text-center shadow-2xl">
        <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-full border border-[rgba(214,181,107,0.30)] bg-[rgba(214,181,107,0.10)]">
          <div className="relative flex h-16 w-16 items-center justify-center">
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-[#69d97b] border-t-transparent" />
            <span className="text-sm font-black text-[#f3dfac]">
              {safeProgress}%
            </span>
          </div>
        </div>

        <h2 className="text-2xl font-black text-white">جاري الإرسال...</h2>

        <p className="mt-4 min-h-[56px] text-sm font-bold leading-7 text-[#d7ddd5]">
          {message || "يتم الآن حفظ بيانات الكفيل ورفع الوثائق، يرجى الانتظار."}
        </p>

        <div className="mt-5 h-4 overflow-hidden rounded-full bg-[rgba(214,181,107,0.14)]">
          <div
            className="h-full rounded-full bg-gradient-to-l from-[#d6b56b] via-[#69d97b] to-[#35c98e] transition-all duration-700"
            style={{ width: `${safeProgress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
