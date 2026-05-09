"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";

type UploadKey = "guarantorIdFront" | "guarantorIdBack";

type ApplicationRecord = {
  id: string;
  tracking_id: string | null;
  full_name: string | null;
  phone: string | null;
  status: string | null;
  device_name: string | null;
};

const guarantorRelationshipOptions = [
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
  { value: "other", label: "أخرى" },
];

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

function translateRelationship(value: string) {
  const found = guarantorRelationshipOptions.find((item) => item.value === value);
  return found?.label || value || "";
}

export default function GuarantorPage() {
  const searchParams = useSearchParams();
  const trackingFromLink = searchParams.get("tracking") || "";
  const phoneFromLink = searchParams.get("phone") || "";

  const [trackingId, setTrackingId] = useState(trackingFromLink);
  const [customerPhone, setCustomerPhone] = useState(cleanDigits(phoneFromLink));
  const [application, setApplication] = useState<ApplicationRecord | null>(null);
  const [isLoadingApplication, setIsLoadingApplication] = useState(false);
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
  const [isCompleted, setIsCompleted] = useState(false);

  useEffect(() => {
    return () => {
      Object.values(previewUrls).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, [previewUrls]);

  useEffect(() => {
    if (trackingFromLink && phoneFromLink) {
      loadApplication(trackingFromLink, cleanDigits(phoneFromLink));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackingFromLink, phoneFromLink]);

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

  async function loadApplication(customTrackingId = trackingId, customPhone = customerPhone) {
    const cleanTrackingId = customTrackingId.trim();
    const cleanPhone = cleanDigits(customPhone);

    if (!cleanTrackingId || !validJordanPhone(cleanPhone)) {
      setApplicationError("أدخل رقم التتبع ورقم هاتف مقدم الطلب بشكل صحيح.");
      return;
    }

    setIsLoadingApplication(true);
    setApplicationError("");

    try {
      const { data, error } = await supabase
        .from("applications")
        .select("id, tracking_id, full_name, phone, status, device_name")
        .eq("tracking_id", cleanTrackingId)
        .eq("phone", cleanPhone)
        .single();

      if (error || !data) {
        setApplication(null);
        setApplicationError("لم يتم العثور على الطلب. تأكد من الرابط أو رقم الهاتف.");
        return;
      }

      setTrackingId(cleanTrackingId);
      setCustomerPhone(cleanPhone);
      setApplication(data as ApplicationRecord);
    } catch (error) {
      console.error(error);
      setApplicationError("حدث خطأ أثناء البحث عن الطلب. حاول مرة ثانية.");
    } finally {
      setIsLoadingApplication(false);
    }
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
      return { ...prev, [key]: URL.createObjectURL(file) };
    });

    setFiles((prev) => ({ ...prev, [key]: file }));
    setProgress((prev) => ({ ...prev, [key]: 0 }));

    let value = 0;
    const interval = window.setInterval(() => {
      value += 10;
      setProgress((prev) => ({ ...prev, [key]: value > 100 ? 100 : value }));
      if (value >= 100) window.clearInterval(interval);
    }, 80);
  }

  function removeFile(key: UploadKey) {
    setPreviewUrls((prev) => {
      if (prev[key]) URL.revokeObjectURL(prev[key]);
      return { ...prev, [key]: "" };
    });

    setFiles((prev) => ({ ...prev, [key]: null }));
    setProgress((prev) => ({ ...prev, [key]: 0 }));
  }

  async function uploadFile(file: File, path: string) {
    const { error } = await supabase.storage.from("documents").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });

    if (error) throw error;

    const { data } = supabase.storage.from("documents").getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!application) {
      alert("يجب تحميل الطلب أولاً قبل إرسال بيانات الكفيل.");
      return;
    }

    const cleanGuarantorPhone = cleanDigits(guarantorPhone);
    const cleanGuarantorNationalId = cleanDigits(guarantorNationalId);

    if (guarantorName.trim().split(/\s+/).length < 4) {
      return alert("اسم الكفيل لازم يكون رباعي");
    }

    if (!validNationalId(cleanGuarantorNationalId)) {
      return alert("الرقم الوطني للكفيل يجب أن يبدأ بـ 9 أو 2 وأن يكون 10 أرقام");
    }

    if (!validJordanPhone(cleanGuarantorPhone)) {
      return alert("رقم هاتف الكفيل يجب أن يبدأ بـ 079 أو 078 أو 077 وأن يكون 10 أرقام");
    }

    if (!guarantorRelationship) {
      return alert("يرجى اختيار صلة الكفيل بمقدم الطلب");
    }

    for (const item of uploadTypes) {
      if (!files[item.key]) {
        return alert("يرجى رفع صورة هوية الكفيل من الأمام والخلف");
      }
    }

    if (!termsAccepted) {
      return alert("يرجى الموافقة على الإقرار قبل إرسال بيانات الكفيل.");
    }

    setIsSubmitting(true);

    try {
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

      for (const item of uploadTypes) {
        const file = files[item.key];
        if (!file) continue;

        const extension = file.type === "image/png" ? "png" : "jpg";
        const path = `${application.tracking_id}/guarantor/${item.type}-${Date.now()}.${extension}`;
        const publicUrl = await uploadFile(file, path);

        const { error: docError } = await supabase.from("documents").insert({
          application_id: application.id,
          type: item.type,
          file_url: publicUrl,
        });

        if (docError) throw docError;
      }

      setIsCompleted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error(error);
      alert("صار خطأ أثناء حفظ بيانات الكفيل. حاول مرة ثانية.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isCompleted) {
    return (
      <main
        dir="rtl"
        className="min-h-screen bg-[#03120e] px-4 py-10 text-white [padding-top:calc(2.5rem+env(safe-area-inset-top))]"
      >
        <div className="glass-panel-strong mx-auto max-w-3xl rounded-[2rem] p-8 text-center shadow-2xl">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[#69d97b] text-4xl text-black">
            ✓
          </div>

          <h1 className="text-4xl font-black">تم استلام بيانات الكفيل</h1>

          <p className="mx-auto mt-4 max-w-2xl leading-8 text-[#d7ddd5]">
            تم تحديث ملف الطلب ورفع هوية الكفيل بنجاح. ستقوم الإدارة بمراجعة
            البيانات، وسيتم التواصل مع مقدم الطلب عبر واتساب عند الحاجة.
          </p>

          <div className="mt-8 rounded-2xl border border-[rgba(214,181,107,0.16)] bg-[rgba(3,18,14,0.74)] p-5 text-right">
            <p className="text-sm text-[#aeb9af]">رقم التتبع</p>
            <p className="mt-2 break-words text-2xl font-black text-[#f3dfac]">
              {trackingId}
            </p>
          </div>

          <Link
            href="/"
            className="green-button mt-8 inline-flex rounded-2xl px-8 py-4 text-center text-base font-black transition"
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
      className="min-h-screen bg-[#03120e] px-4 py-10 text-white [padding-top:calc(2.5rem+env(safe-area-inset-top))]"
    >
      <div className="mx-auto max-w-4xl space-y-6">
        <section className="site-shell pattern-lines rounded-[2rem] p-8 shadow-2xl">
          <div className="gold-chip mb-4 inline-flex rounded-full px-4 py-2 text-sm font-black">
            الأمين للأقساط والتمويل — استكمال بيانات الكفيل
          </div>

          <h1 className="text-4xl font-black leading-tight md:text-6xl">
            رابط استكمال بيانات الكفيل
          </h1>

          <p className="mt-4 max-w-2xl leading-8 text-[#d7ddd5]">
            هذه الصفحة مخصصة للحالات التي تطلب فيها الإدارة كفيلًا لاستكمال دراسة
            طلب التقسيط. أدخل بيانات الكفيل وارفع صورة الهوية من الأمام والخلف.
          </p>
        </section>

        <section className="glass-panel gold-outline rounded-3xl p-5 shadow-2xl">
          <h2 className="mb-4 text-2xl font-bold">1. التحقق من الطلب</h2>

          <div className="grid gap-4 md:grid-cols-2">
            <input
              className={inputClass}
              placeholder="رقم التتبع مثل AM-123456789"
              value={trackingId}
              onChange={(e) => setTrackingId(e.target.value)}
            />

            <input
              className={inputClass}
              inputMode="tel"
              placeholder="رقم هاتف مقدم الطلب"
              value={customerPhone}
              maxLength={10}
              onChange={(e) => setCustomerPhone(cleanDigits(e.target.value).slice(0, 10))}
            />
          </div>

          <button
            type="button"
            onClick={() => loadApplication()}
            disabled={isLoadingApplication}
            className="green-button mt-4 rounded-2xl px-6 py-4 text-base font-black disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoadingApplication ? "جاري التحقق..." : "تحقق من الطلب"}
          </button>

          {applicationError && (
            <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-950/30 p-4 text-sm font-bold leading-7 text-red-200">
              {applicationError}
            </div>
          )}

          {application && (
            <div className="mt-4 rounded-2xl border border-[rgba(105,217,123,0.28)] bg-[rgba(7,49,38,0.45)] p-4 text-sm leading-7 text-[#d7ddd5]">
              <p className="font-black text-[#b8f3c0]">تم العثور على الطلب ✅</p>
              <p>مقدم الطلب: {application.full_name}</p>
              <p>الجهاز: {application.device_name || "غير محدد"}</p>
              <p>الحالة الحالية: {application.status || "قيد المراجعة"}</p>
            </div>
          )}
        </section>

        {application && (
          <form onSubmit={handleSubmit} className="space-y-6">
            <section className="glass-panel gold-outline rounded-3xl p-5 shadow-2xl">
              <h2 className="mb-4 text-2xl font-bold">2. بيانات الكفيل</h2>

              <div className="space-y-4">
                <input
                  className={inputClass}
                  placeholder="اسم الكفيل الرباعي"
                  value={guarantorName}
                  onChange={(e) => setGuarantorName(e.target.value)}
                />

                <input
                  className={inputClass}
                  inputMode="numeric"
                  placeholder="الرقم الوطني للكفيل: يبدأ بـ 9 أو 2 — 10 أرقام"
                  value={guarantorNationalId}
                  maxLength={10}
                  onChange={(e) => setGuarantorNationalId(cleanDigits(e.target.value).slice(0, 10))}
                />

                <input
                  className={inputClass}
                  inputMode="tel"
                  placeholder="رقم هاتف الكفيل: 079 / 078 / 077"
                  value={guarantorPhone}
                  maxLength={10}
                  onChange={(e) => setGuarantorPhone(cleanDigits(e.target.value).slice(0, 10))}
                />

                <input
                  className={inputClass}
                  placeholder="مكان عمل الكفيل — اختياري"
                  value={guarantorEmployer}
                  onChange={(e) => setGuarantorEmployer(e.target.value)}
                />

                <select
                  className={inputClass}
                  value={guarantorRelationship}
                  onChange={(e) => setGuarantorRelationship(e.target.value)}
                >
                  {guarantorRelationshipOptions.map((option) => (
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
              <h2 className="mb-2 text-2xl font-bold">3. رفع هوية الكفيل</h2>

              <p className="mb-5 text-sm leading-7 text-[#d7ddd5]">
                ارفع صورة واضحة لهوية الكفيل من الأمام والخلف. الصيغ المقبولة:
                JPG أو PNG، والحد الأقصى 5MB لكل صورة.
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
                          يمكنك اختيار صورة محفوظة أو تصوير الهوية مباشرة.
                        </span>

                        <input
                          type="file"
                          accept="image/png,image/jpeg"
                          onChange={(e) => handleFileChange(item.key, e.target.files?.[0] || null)}
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
                            {percent < 100 ? `جارٍ تجهيز الملف... ${percent}%` : "اكتمل 100% ✅"}
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
              <label className="flex items-start gap-3 rounded-2xl border border-[rgba(214,181,107,0.24)] bg-[rgba(214,181,107,0.07)] p-4 leading-7">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-2"
                />

                <span>
                  أقرّ بأن بيانات الكفيل والوثائق المرفوعة صحيحة، وأوافق على استخدامها
                  فقط لغرض استكمال دراسة طلب التقسيط لدى الأمين للأقساط والتمويل.
                </span>
              </label>
            </section>

            <button
              disabled={isSubmitting}
              className="green-button sticky bottom-4 w-full rounded-2xl p-5 text-lg font-black shadow-2xl disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "جاري حفظ بيانات الكفيل..." : "إرسال بيانات الكفيل"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
