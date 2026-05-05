"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { getProductById } from "../../lib/products";
import { calculateInstallment, formatJod } from "../../lib/installments";

type UploadKey =
  | "applicantIdFront"
  | "applicantIdBack"
  | "guarantorIdFront"
  | "guarantorIdBack";

type ExistingApplication = {
  id: string;
  tracking_id: string | null;
  status: string | null;
  national_id: string | null;
  guarantor_national_id: string | null;
  full_name: string | null;
};

const uploadTypes: { key: UploadKey; type: string; label: string }[] = [
  {
    key: "applicantIdFront",
    type: "applicant_front",
    label: "هوية مقدم الطلب — الوجه الأمامي",
  },
  {
    key: "applicantIdBack",
    type: "applicant_back",
    label: "هوية مقدم الطلب — الوجه الخلفي",
  },
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

const guarantorRelationshipOptions = [
  { value: "", label: "اختر صلة القرابة" },
  { value: "father", label: "الأب" },
  { value: "mother", label: "الأم" },
  { value: "brother", label: "الأخ" },
  { value: "sister", label: "الأخت" },
  { value: "son", label: "الابن" },
  { value: "daughter", label: "الابنة" },
  { value: "spouse", label: "الزوج / الزوجة" },
];

function translateRelationship(value: string) {
  const found = guarantorRelationshipOptions.find(
    (item) => item.value === value
  );

  return found?.label || value || "";
}

function safeNumber(value: string | null, fallback: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function ApplyPage() {
  const searchParams = useSearchParams();

  const selectedProductId = searchParams.get("product");
  const selectedProduct = getProductById(selectedProductId);

  const selectedMonths = useMemo(() => {
    const months = safeNumber(searchParams.get("months"), 24);

    return [12, 24, 36].includes(months) ? months : 24;
  }, [searchParams]);

  const selectedDownPayment = useMemo(() => {
    return Math.max(safeNumber(searchParams.get("downPayment"), 0), 0);
  }, [searchParams]);

  const selectedInstallment = useMemo(() => {
    if (!selectedProduct) return null;

    return calculateInstallment({
      price: selectedProduct.price,
      months: selectedMonths,
      downPayment: selectedDownPayment,
    });
  }, [selectedProduct, selectedMonths, selectedDownPayment]);

  const [fullName, setFullName] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [governorate, setGovernorate] = useState("");
  const [cityArea, setCityArea] = useState("");
  const [detailedAddress, setDetailedAddress] = useState("");
  const [nearestLandmark, setNearestLandmark] = useState("");
  const [employer, setEmployer] = useState("");
  const [salary, setSalary] = useState("");

  const [applicantSocialSecurity, setApplicantSocialSecurity] = useState(true);
  const [guarantorSocialSecurity, setGuarantorSocialSecurity] = useState(false);
  const [guarantorRelationship, setGuarantorRelationship] = useState("");

  const [guarantorName, setGuarantorName] = useState("");
  const [guarantorPhone, setGuarantorPhone] = useState("");
  const [guarantorNationalId, setGuarantorNationalId] = useState("");

  const [financialClear, setFinancialClear] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [successTrackingId, setSuccessTrackingId] = useState("");
  const [paymentDeadlineTime, setPaymentDeadlineTime] = useState<number | null>(
    null
  );
  const [timeLeft, setTimeLeft] = useState(60 * 60);
  const [showBeneficiaryName, setShowBeneficiaryName] = useState(false);
  const [paidClicked, setPaidClicked] = useState(false);
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentCompleted, setPaymentCompleted] = useState(false);

  const [files, setFiles] = useState<Record<UploadKey, File | null>>({
    applicantIdFront: null,
    applicantIdBack: null,
    guarantorIdFront: null,
    guarantorIdBack: null,
  });

  const [previewUrls, setPreviewUrls] = useState<Record<UploadKey, string>>({
    applicantIdFront: "",
    applicantIdBack: "",
    guarantorIdFront: "",
    guarantorIdBack: "",
  });

  const [progress, setProgress] = useState<Record<UploadKey, number>>({
    applicantIdFront: 0,
    applicantIdBack: 0,
    guarantorIdFront: 0,
    guarantorIdBack: 0,
  });

  useEffect(() => {
    if (!paymentDeadlineTime) return;

    const interval = setInterval(() => {
      const remaining = Math.max(
        0,
        Math.floor((paymentDeadlineTime - Date.now()) / 1000)
      );

      setTimeLeft(remaining);
    }, 1000);

    return () => clearInterval(interval);
  }, [paymentDeadlineTime]);

  useEffect(() => {
    return () => {
      Object.values(previewUrls).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, [previewUrls]);

  const inputClass =
    "w-full rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4 text-white outline-none transition placeholder:text-zinc-500 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20";

  const labelBoxClass =
    "flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4";

  function cleanDigits(value: string) {
    return value.replace(/\D/g, "");
  }

  function validJordanPhone(value: string) {
    return /^(079|078|077)[0-9]{7}$/.test(value);
  }

  function validNationalId(value: string) {
    return /^[92][0-9]{9}$/.test(value);
  }

  function formatCountdown(seconds: number) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    return `${String(h).padStart(2, "0")}:${String(m).padStart(
      2,
      "0"
    )}:${String(s).padStart(2, "0")}`;
  }

  function getEligibilityPath() {
    if (applicantSocialSecurity) {
      return "applicant_social_security";
    }

    return "guarantor_social_security_first_degree";
  }

  function getRequiredSalaryMinimum() {
    return applicantSocialSecurity ? 350 : 400;
  }

  function isActiveApplication(status: string | null) {
    return status !== "rejected" && status !== "cancelled";
  }

  async function checkDuplicateActiveApplication(params: {
    cleanNationalId: string;
    cleanGuarantorNationalId: string;
  }) {
    const filters = [
      `national_id.eq.${params.cleanNationalId}`,
      `guarantor_national_id.eq.${params.cleanNationalId}`,
      `national_id.eq.${params.cleanGuarantorNationalId}`,
      `guarantor_national_id.eq.${params.cleanGuarantorNationalId}`,
    ].join(",");

    const { data, error } = await supabase
      .from("applications")
      .select(
        "id, tracking_id, status, national_id, guarantor_national_id, full_name"
      )
      .or(filters)
      .limit(20);

    if (error) {
      throw error;
    }

    const existing = ((data || []) as ExistingApplication[]).find((app) =>
      isActiveApplication(app.status)
    );

    if (!existing) {
      return null;
    }

    return existing;
  }

  function handleFileChange(key: UploadKey, file: File | null) {
    if (!file) return;

    const currentScroll = window.scrollY;
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
      if (prev[key]) {
        URL.revokeObjectURL(prev[key]);
      }

      return {
        ...prev,
        [key]: URL.createObjectURL(file),
      };
    });

    setFiles((prev) => ({ ...prev, [key]: file }));
    setProgress((prev) => ({ ...prev, [key]: 0 }));
    setTimeout(() => window.scrollTo({ top: currentScroll }), 0);

    let value = 0;

    const interval = setInterval(() => {
      value += 10;

      setProgress((prev) => ({
        ...prev,
        [key]: value > 100 ? 100 : value,
      }));

      if (value >= 100) clearInterval(interval);
    }, 80);
  }

  function removeFile(key: UploadKey) {
    const currentScroll = window.scrollY;

    setPreviewUrls((prev) => {
      if (prev[key]) {
        URL.revokeObjectURL(prev[key]);
      }

      return {
        ...prev,
        [key]: "",
      };
    });

    setFiles((prev) => ({ ...prev, [key]: null }));
    setProgress((prev) => ({ ...prev, [key]: 0 }));
    setTimeout(() => window.scrollTo({ top: currentScroll }), 0);
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

  async function sendApplicationCreatedDiscordNotification(params: {
    trackingId: string;
    cleanPhone: string;
    cleanGuarantorPhone: string;
    cleanGuarantorNationalId: string;
    eligibilityPath: string;
  }) {
    try {
      const response = await fetch("/api/discord/application-created", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trackingId: params.trackingId,
          fullName: fullName.trim(),
          phone: params.cleanPhone,
          email: email.trim(),
          governorate,
          cityArea: cityArea.trim(),
          salary: Number(salary),
          guarantorName: guarantorName.trim(),
          guarantorPhone: params.cleanGuarantorPhone,
          guarantorNationalId: params.cleanGuarantorNationalId,
          applicantSocialSecurity,
          guarantorSocialSecurity,
          guarantorRelationship: translateRelationship(guarantorRelationship),
          eligibilityPath: params.eligibilityPath,
          deviceId: selectedProduct?.id || "",
          deviceName: selectedProduct
            ? `${selectedProduct.name} - ${selectedProduct.model}`
            : "",
          devicePrice: selectedProduct?.price || "",
          installmentMonths: selectedProduct ? selectedMonths : "",
          downPayment: selectedProduct ? selectedDownPayment : "",
          monthlyPayment: selectedInstallment?.monthly || "",
          status: "pending_payment",
          paymentStatus: "pending",
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error("Discord notification failed:", text);
      }
    } catch (discordError) {
      console.error("Discord notification error:", discordError);
    }
  }

  async function sendPaymentConfirmedDiscordNotification(params: {
    trackingId: string;
    cleanReference: string;
  }) {
    try {
      const response = await fetch("/api/discord/payment-confirmed", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trackingId: params.trackingId,
          fullName: fullName.trim(),
          phone: cleanDigits(phone),
          paymentReference: params.cleanReference,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error("Discord payment notification failed:", text);
      }
    } catch (discordError) {
      console.error("Discord payment notification error:", discordError);
    }
  }

  async function markPaidClicked() {
    if (!successTrackingId) return;

    const cleanReference = paymentReference.trim();

    if (timeLeft === 0) {
      alert("انتهت مهلة الدفع. يرجى تقديم طلب جديد أو التواصل مع الإدارة.");
      return;
    }

    if (cleanReference.length < 3) {
      alert("يرجى إدخال رقم الوصل أو رقم الحركة قبل تأكيد الدفع.");
      return;
    }

    setPaidClicked(true);

    const { error } = await supabase
      .from("applications")
      .update({
        payment_status: "customer_claimed_paid",
        status: "pending_payment_confirmation",
        payment_reference: cleanReference,
        paid_clicked_at: new Date().toISOString(),
      })
      .eq("tracking_id", successTrackingId);

    if (error) {
      console.error(error);
      alert("صار خطأ أثناء تسجيل الدفع. حاول مرة ثانية.");
      setPaidClicked(false);
      return;
    }

    await sendPaymentConfirmedDiscordNotification({
      trackingId: successTrackingId,
      cleanReference,
    });

    setPaymentCompleted(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (isSubmitting) return;

    const cleanPhone = cleanDigits(phone);
    const cleanNationalId = cleanDigits(nationalId);
    const cleanGuarantorPhone = cleanDigits(guarantorPhone);
    const cleanGuarantorNationalId = cleanDigits(guarantorNationalId);
    const salaryNumber = Number(salary);
    const requiredSalaryMinimum = getRequiredSalaryMinimum();
    const eligibilityPath = getEligibilityPath();

    if (fullName.trim().split(/\s+/).length < 4) {
      return alert("الاسم لازم يكون رباعي");
    }

    if (!validNationalId(cleanNationalId)) {
      return alert("الرقم الوطني يجب أن يبدأ بـ 9 أو 2 وأن يكون 10 أرقام");
    }

    if (!validJordanPhone(cleanPhone)) {
      return alert(
        "رقم الهاتف يجب أن يبدأ بـ 079 أو 078 أو 077 وأن يكون 10 أرقام"
      );
    }

    if (!email.includes("@") || !email.includes(".")) {
      return alert("الإيميل غير صحيح");
    }

    if (!governorate || !cityArea || !detailedAddress) {
      return alert("يرجى تعبئة المحافظة والمنطقة والعنوان التفصيلي");
    }

    if (Number.isNaN(salaryNumber)) {
      return alert("يرجى إدخال الراتب الصافي بشكل صحيح");
    }

    if (salaryNumber < requiredSalaryMinimum) {
      return alert(
        applicantSocialSecurity
          ? "الراتب الصافي يجب ألا يقل عن 350 دينار للمشتركين بالضمان"
          : "إذا مقدم الطلب غير مشترك بالضمان، يجب ألا يقل الراتب الصافي عن 400 دينار"
      );
    }

    if (!applicantSocialSecurity) {
      if (!guarantorSocialSecurity) {
        return alert(
          "إذا مقدم الطلب غير مشترك بالضمان، يجب أن يكون الكفيل مشتركًا بالضمان الاجتماعي"
        );
      }

      if (!guarantorRelationship) {
        return alert(
          "إذا مقدم الطلب غير مشترك بالضمان، يجب اختيار صلة القرابة مع الكفيل"
        );
      }
    }

    if (guarantorName.trim().split(/\s+/).length < 4) {
      return alert("اسم الكفيل لازم يكون رباعي");
    }

    if (!validJordanPhone(cleanGuarantorPhone)) {
      return alert(
        "رقم هاتف الكفيل يجب أن يبدأ بـ 079 أو 078 أو 077 وأن يكون 10 أرقام"
      );
    }

    if (!validNationalId(cleanGuarantorNationalId)) {
      return alert("الرقم الوطني للكفيل يجب أن يبدأ بـ 9 أو 2 وأن يكون 10 أرقام");
    }

    if (cleanNationalId === cleanGuarantorNationalId) {
      return alert("لا يمكن أن يكون مقدم الطلب هو نفس الكفيل.");
    }

    for (const item of uploadTypes) {
      if (!files[item.key]) {
        return alert("يرجى رفع جميع صور الهويات المطلوبة");
      }
    }

    if (!financialClear) {
      return alert("يجب الإقرار بعدم وجود قضايا مالية");
    }

    if (!termsAccepted) {
      return alert("يجب الموافقة على الشروط والأحكام");
    }

    setIsSubmitting(true);

    try {
      const duplicateApplication = await checkDuplicateActiveApplication({
        cleanNationalId,
        cleanGuarantorNationalId,
      });

      if (duplicateApplication) {
        alert(
          `لا يمكن تقديم طلب جديد. يوجد طلب فعّال مرتبط بنفس الرقم الوطني أو رقم الكفيل.\nرقم التتبع: ${
            duplicateApplication.tracking_id || duplicateApplication.id
          }\nالحالة الحالية: ${duplicateApplication.status || "قيد المتابعة"}`
        );

        setIsSubmitting(false);
        return;
      }

      const trackingId = "AM-" + Date.now();
      const deadlineMs = Date.now() + 60 * 60 * 1000;
      const paymentDeadline = new Date(deadlineMs).toISOString();

      const deviceName = selectedProduct
        ? `${selectedProduct.name} - ${selectedProduct.model}`
        : null;

      const { data: application, error: appError } = await supabase
        .from("applications")
        .insert({
          tracking_id: trackingId,
          full_name: fullName.trim(),
          national_id: cleanNationalId,
          phone: cleanPhone,
          email: email.trim(),
          governorate,
          city_area: cityArea.trim(),
          detailed_address: detailedAddress.trim(),
          nearest_landmark: nearestLandmark.trim(),
          employer: employer.trim(),
          salary: salaryNumber,

          social_security: applicantSocialSecurity,
          applicant_social_security: applicantSocialSecurity,
          guarantor_social_security: guarantorSocialSecurity,
          guarantor_relationship: translateRelationship(guarantorRelationship),
          guarantor_national_id: cleanGuarantorNationalId,
          eligibility_path: eligibilityPath,

          device_id: selectedProduct?.id || null,
          device_name: deviceName,
          device_price: selectedProduct?.price || null,
          installment_months: selectedProduct ? selectedMonths : null,
          down_payment: selectedProduct
            ? selectedInstallment?.downPayment || 0
            : null,
          interest_rate: selectedProduct
            ? selectedInstallment?.interestRate || null
            : null,
          monthly_payment: selectedProduct
            ? selectedInstallment?.monthly || null
            : null,
          total_with_interest: selectedProduct
            ? selectedInstallment?.totalWithInterest || null
            : null,

          guarantor_name: guarantorName.trim(),
          guarantor_phone: cleanGuarantorPhone,
          financial_clear: financialClear,
          terms_accepted: termsAccepted,
          status: "pending_payment",
          payment_status: "pending",
          payment_deadline: paymentDeadline,
        })
        .select()
        .single();

      if (appError) throw appError;

      for (const item of uploadTypes) {
        const file = files[item.key];

        if (!file) continue;

        const extension = file.type === "image/png" ? "png" : "jpg";
        const path = `${trackingId}/${item.type}-${Date.now()}.${extension}`;
        const publicUrl = await uploadFile(file, path);

        const { error: docError } = await supabase.from("documents").insert({
          application_id: application.id,
          type: item.type,
          file_url: publicUrl,
        });

        if (docError) throw docError;
      }

      await sendApplicationCreatedDiscordNotification({
        trackingId,
        cleanPhone,
        cleanGuarantorPhone,
        cleanGuarantorNationalId,
        eligibilityPath,
      });

      setSuccessTrackingId(trackingId);
      setPaymentDeadlineTime(deadlineMs);
      setTimeLeft(60 * 60);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error(error);
      alert("صار خطأ أثناء حفظ الطلب أو رفع الصور. ابعتلي صورة الخطأ.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (successTrackingId && paymentCompleted) {
    const trackHref = `/track?phone=${encodeURIComponent(
      cleanDigits(phone)
    )}&tracking=${encodeURIComponent(successTrackingId)}`;

    return (
      <main
        dir="rtl"
        className="min-h-screen bg-[radial-gradient(circle_at_top,#112b16_0%,#050505_38%,#000_100%)] px-4 py-10 text-white"
      >
        <div className="mx-auto max-w-3xl rounded-[2rem] border border-green-500/30 bg-black/80 p-8 text-center shadow-2xl">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-500 text-4xl text-black">
            ✓
          </div>

          <div className="mb-4 inline-flex rounded-full border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm text-green-300">
            تم تسجيل الدفع بنجاح
          </div>

          <h1 className="text-4xl font-black">
            طلبك الآن بانتظار تأكيد الإدارة
          </h1>

          <p className="mx-auto mt-4 max-w-2xl leading-8 text-zinc-300">
            تم تسجيل رقم الوصل/الحركة، وسيتم التحقق من الدفع من قبل الإدارة.
            بعد التأكيد سيتم تحويل الطلب إلى مرحلة الدراسة.
          </p>

          <div className="mt-8 grid gap-4 text-right md:grid-cols-2">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-5">
              <p className="text-sm text-zinc-400">رقم التتبع</p>

              <p className="mt-2 break-words text-2xl font-black text-orange-400">
                {successTrackingId}
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-5">
              <p className="text-sm text-zinc-400">رقم الوصل / الحركة</p>

              <p className="mt-2 break-words text-2xl font-black text-green-400">
                {paymentReference.trim()}
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <Link
              href={trackHref}
              className="rounded-2xl bg-green-500 px-6 py-4 text-center text-base font-black text-black transition hover:bg-green-400"
            >
              تتبع حالة الطلب
            </Link>

            <Link
              href="/"
              className="rounded-2xl border border-zinc-700 bg-zinc-950 px-6 py-4 text-center text-base font-black text-white transition hover:bg-zinc-900"
            >
              العودة للرئيسية
            </Link>
          </div>

          <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-5 text-sm leading-8 text-zinc-300">
            احتفظ برقم التتبع ورقم الوصل. قد تتواصل الإدارة معك للتأكد من
            العملية قبل بدء دراسة الطلب.
          </div>
        </div>
      </main>
    );
  }

  if (successTrackingId) {
    return (
      <main
        dir="rtl"
        className="min-h-screen bg-[radial-gradient(circle_at_top,#2b1607_0%,#050505_38%,#000_100%)] px-4 py-10 text-white"
      >
        <div className="mx-auto max-w-3xl rounded-[2rem] border border-orange-500/30 bg-black/80 p-8 shadow-2xl">
          <div className="mb-4 inline-flex rounded-full border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm text-green-300">
            تم استلام الطلب بنجاح ✅
          </div>

          <h1 className="text-4xl font-black">
            خطوة الدفع لاستكمال المراجعة
          </h1>

          <p className="mt-4 leading-8 text-zinc-300">
            رقم طلبك هو:
            <strong className="mx-2 text-orange-400">
              {successTrackingId}
            </strong>
            يرجى دفع رسوم معالجة الطلب قبل انتهاء المهلة حتى لا يتم إلغاء الطلب
            تلقائيًا.
          </p>

          {selectedProduct && selectedInstallment && (
            <div className="mt-6 rounded-2xl border border-orange-700 bg-orange-950/40 p-5">
              <h2 className="text-xl font-black text-orange-300">
                ملخص الجهاز
              </h2>

              <div className="mt-4 grid gap-3 text-sm leading-7 text-zinc-300 md:grid-cols-2">
                <p>الجهاز: {selectedProduct.name}</p>
                <p>الموديل: {selectedProduct.model}</p>
                <p>السعر: {formatJod(selectedProduct.price)}</p>
                <p>مدة التقسيط: {selectedMonths} شهر</p>
                <p>
                  الدفعة الأولى: {formatJod(selectedInstallment.downPayment)}
                </p>
                <p>
                  القسط التقريبي: {formatJod(selectedInstallment.monthly)} /
                  شهر
                </p>
              </div>
            </div>
          )}

          <div className="mt-6 rounded-2xl border border-red-700 bg-red-950/30 p-5 text-center">
            <p className="text-sm text-zinc-300">
              الوقت المتبقي قبل إلغاء الطلب
            </p>

            <p className="mt-2 text-4xl font-black text-red-300">
              {formatCountdown(timeLeft)}
            </p>

            <p className="mt-2 text-sm text-zinc-400">
              مدة الدفع المتاحة: ساعة واحدة فقط
            </p>
          </div>

          <div className="mt-6 rounded-2xl border border-orange-700 bg-orange-950/40 p-5">
            <p className="text-xl font-black text-orange-300">
              المبلغ المطلوب: 5 دنانير
            </p>

            <p className="mt-2 text-sm text-zinc-300">
              رسوم معالجة غير مستردة ولا تعني الموافقة النهائية على التقسيط.
            </p>
          </div>

          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-5">
              <h2 className="text-2xl font-bold">كليك</h2>

              <p className="mt-3 text-zinc-300">اسم كليك:</p>

              <div className="mt-2 rounded-xl border border-zinc-700 bg-black p-4 font-black text-orange-400">
                AMEENPAY
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-5">
              <h2 className="text-2xl font-bold">Orange Money</h2>

              <p className="mt-3 text-zinc-300">
                اسم المستفيد مخفي لحماية الخصوصية.
              </p>

              {!showBeneficiaryName ? (
                <button
                  type="button"
                  onClick={() => setShowBeneficiaryName(true)}
                  className="mt-4 rounded-xl bg-orange-500 px-5 py-3 font-black text-black"
                >
                  إظهار اسم المستفيد
                </button>
              ) : (
                <div className="mt-4 rounded-xl border border-zinc-700 bg-black p-4 font-bold text-orange-300">
                  عبدالرحمن تيسير ناصر الحراحشه
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-5">
            <label className="mb-3 block text-lg font-black text-white">
              رقم الوصل / رقم الحركة
            </label>

            <input
              className={inputClass}
              placeholder="اكتب رقم الوصل أو رقم الحركة هنا"
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
            />

            <p className="mt-3 text-sm leading-7 text-zinc-400">
              يجب إدخال رقم الوصل أو رقم الحركة قبل الضغط على تأكيد الدفع.
            </p>
          </div>

          <button
            type="button"
            onClick={markPaidClicked}
            disabled={paidClicked || timeLeft === 0}
            className="mt-6 w-full rounded-2xl bg-green-500 p-5 text-lg font-black text-black shadow-2xl transition hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {paidClicked ? "جاري تسجيل الدفع..." : "تأكيد الدفع"}
          </button>

          <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-5 leading-8 text-zinc-300">
            بعد الضغط على “تأكيد الدفع”، سيتم وضع الطلب بانتظار تأكيد الإدارة.
            احتفظ برقم الوصل/الحركة لأن الإدارة قد تطلبه منك.
          </div>
        </div>
      </main>
    );
  }

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[radial-gradient(circle_at_top,#2b1607_0%,#050505_38%,#000_100%)] px-4 py-10 text-white"
    >
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 rounded-[2rem] border border-orange-500/20 bg-black/70 p-8 shadow-2xl backdrop-blur">
          <div className="mb-4 inline-flex rounded-full border border-orange-500/30 bg-orange-500/10 px-4 py-2 text-sm text-orange-300">
            الأمين للتمويل — طلب تقسيط آمن وسريع
          </div>

          <h1 className="text-4xl font-black leading-tight md:text-6xl">
            قدّم طلب التقسيط خلال دقائق
          </h1>

          <p className="mt-4 max-w-2xl text-zinc-300">
            عبّئ البيانات بدقة، ارفع صور الهويات المطلوبة، وبعد تقديم الطلب يتم
            دفع رسوم معالجة 5 دنانير لاستكمال مراجعة الملف والتقييم الأولي.
          </p>
        </div>

        {selectedProduct && selectedInstallment ? (
          <section className="mb-6 rounded-3xl border border-orange-500/30 bg-orange-950/30 p-5 shadow-2xl">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-bold text-orange-300">
                  الجهاز المختار
                </p>

                <h2 className="mt-2 text-2xl font-black text-white">
                  {selectedProduct.name}
                </h2>

                <p className="mt-1 text-sm text-zinc-300">
                  {selectedProduct.model}
                </p>
              </div>

              <Link
                href="/products"
                className="rounded-2xl border border-orange-500/30 bg-black/40 px-5 py-3 text-center text-sm font-black text-orange-300 transition hover:bg-black"
              >
                تغيير الجهاز
              </Link>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-zinc-800 bg-black/50 p-4">
                <p className="text-xs text-zinc-400">السعر</p>

                <p className="mt-1 text-lg font-black text-white">
                  {formatJod(selectedProduct.price)}
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-black/50 p-4">
                <p className="text-xs text-zinc-400">مدة التقسيط</p>

                <p className="mt-1 text-lg font-black text-white">
                  {selectedMonths} شهر
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-black/50 p-4">
                <p className="text-xs text-zinc-400">الدفعة الأولى</p>

                <p className="mt-1 text-lg font-black text-white">
                  {formatJod(selectedInstallment.downPayment)}
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-black/50 p-4">
                <p className="text-xs text-zinc-400">القسط التقريبي</p>

                <p className="mt-1 text-lg font-black text-orange-300">
                  {formatJod(selectedInstallment.monthly)}
                </p>
              </div>
            </div>
          </section>
        ) : (
          <section className="mb-6 rounded-3xl border border-zinc-800 bg-black/50 p-5 shadow-2xl">
            <h2 className="text-xl font-black">طلب عام بدون جهاز محدد</h2>

            <p className="mt-2 text-sm leading-7 text-zinc-300">
              لم يتم اختيار جهاز من صفحة المنتجات. يمكنك متابعة الطلب العام، أو
              الرجوع لاختيار جهاز محدد.
            </p>

            <Link
              href="/products"
              className="mt-4 inline-flex rounded-2xl bg-orange-500 px-5 py-3 text-sm font-black text-black"
            >
              اختيار جهاز
            </Link>
          </section>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="rounded-3xl border border-zinc-800 bg-black/50 p-5 shadow-2xl">
            <h2 className="mb-4 text-2xl font-bold">1. بيانات مقدم الطلب</h2>

            <div className="space-y-4">
              <input
                className={inputClass}
                placeholder="الاسم الرباعي"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />

              <input
                className={inputClass}
                placeholder="الرقم الوطني: يبدأ بـ 9 أو 2 — 10 أرقام"
                value={nationalId}
                maxLength={10}
                onChange={(e) =>
                  setNationalId(cleanDigits(e.target.value).slice(0, 10))
                }
              />

              <input
                className={inputClass}
                placeholder="رقم الهاتف: 079 / 078 / 077"
                value={phone}
                maxLength={10}
                onChange={(e) =>
                  setPhone(cleanDigits(e.target.value).slice(0, 10))
                }
              />

              <input
                className={inputClass}
                placeholder="البريد الإلكتروني"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </section>

          <section className="rounded-3xl border border-zinc-800 bg-black/50 p-5 shadow-2xl">
            <h2 className="mb-4 text-2xl font-bold">2. العنوان</h2>

            <div className="space-y-4">
              <select
                className={inputClass}
                value={governorate}
                onChange={(e) => setGovernorate(e.target.value)}
              >
                <option value="">اختر المحافظة</option>
                <option value="Amman">عمّان</option>
                <option value="Zarqa">الزرقاء</option>
                <option value="Irbid">إربد</option>
                <option value="Balqa">البلقاء</option>
                <option value="Madaba">مادبا</option>
                <option value="Karak">الكرك</option>
                <option value="Aqaba">العقبة</option>
                <option value="Mafraq">المفرق</option>
                <option value="Jerash">جرش</option>
                <option value="Ajloun">عجلون</option>
                <option value="Tafilah">الطفيلة</option>
                <option value="Maan">معان</option>
              </select>

              <input
                className={inputClass}
                placeholder="المدينة / المنطقة"
                value={cityArea}
                onChange={(e) => setCityArea(e.target.value)}
              />

              <input
                className={inputClass}
                placeholder="العنوان التفصيلي"
                value={detailedAddress}
                onChange={(e) => setDetailedAddress(e.target.value)}
              />

              <input
                className={inputClass}
                placeholder="أقرب معلم واضح"
                value={nearestLandmark}
                onChange={(e) => setNearestLandmark(e.target.value)}
              />
            </div>
          </section>

          <section className="rounded-3xl border border-zinc-800 bg-black/50 p-5 shadow-2xl">
            <h2 className="mb-4 text-2xl font-bold">3. بيانات العمل والدخل</h2>

            <div className="space-y-4">
              <input
                className={inputClass}
                placeholder="مكان العمل"
                value={employer}
                onChange={(e) => setEmployer(e.target.value)}
              />

              <input
                className={inputClass}
                placeholder={
                  applicantSocialSecurity
                    ? "الراتب الصافي بالدينار — الحد الأدنى 350"
                    : "الراتب الصافي بالدينار — الحد الأدنى 400"
                }
                type="number"
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
              />

              <div className="rounded-2xl border border-orange-700 bg-orange-950/30 p-4">
                <p className="mb-3 font-bold text-orange-300">
                  هل مقدم الطلب مشترك بالضمان الاجتماعي؟
                </p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={labelBoxClass}>
                    <input
                      type="radio"
                      name="applicantSocialSecurity"
                      checked={applicantSocialSecurity === true}
                      onChange={() => {
                        setApplicantSocialSecurity(true);
                        setGuarantorSocialSecurity(false);
                        setGuarantorRelationship("");
                      }}
                    />

                    <span>نعم، مشترك بالضمان</span>
                  </label>

                  <label className={labelBoxClass}>
                    <input
                      type="radio"
                      name="applicantSocialSecurity"
                      checked={applicantSocialSecurity === false}
                      onChange={() => setApplicantSocialSecurity(false)}
                    />

                    <span>لا، غير مشترك بالضمان</span>
                  </label>
                </div>

                <div className="mt-4 rounded-2xl border border-zinc-800 bg-black/40 p-4 text-sm leading-7 text-zinc-300">
                  {applicantSocialSecurity
                    ? "في حال كان مقدم الطلب مشتركًا بالضمان، يجب ألا يقل الراتب الصافي عن 350 دينار."
                    : "في حال عدم اشتراك مقدم الطلب بالضمان، يجب ألا يقل الراتب الصافي عن 400 دينار، وأن يكون الكفيل مشتركًا بالضمان ومن قرابة مقبولة."}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-zinc-800 bg-black/50 p-5 shadow-2xl">
            <h2 className="mb-4 text-2xl font-bold">4. بيانات الكفيل</h2>

            <div className="space-y-4">
              <input
                className={inputClass}
                placeholder="اسم الكفيل الرباعي"
                value={guarantorName}
                onChange={(e) => setGuarantorName(e.target.value)}
              />

              <input
                className={inputClass}
                placeholder="الرقم الوطني للكفيل: يبدأ بـ 9 أو 2 — 10 أرقام"
                value={guarantorNationalId}
                maxLength={10}
                onChange={(e) =>
                  setGuarantorNationalId(
                    cleanDigits(e.target.value).slice(0, 10)
                  )
                }
              />

              <input
                className={inputClass}
                placeholder="رقم هاتف الكفيل: 079 / 078 / 077"
                value={guarantorPhone}
                maxLength={10}
                onChange={(e) =>
                  setGuarantorPhone(cleanDigits(e.target.value).slice(0, 10))
                }
              />

              {!applicantSocialSecurity && (
                <div className="space-y-4 rounded-2xl border border-orange-700 bg-orange-950/30 p-4">
                  <p className="font-bold text-orange-300">
                    شروط إضافية لأن مقدم الطلب غير مشترك بالضمان
                  </p>

                  <label className={labelBoxClass}>
                    <input
                      type="checkbox"
                      checked={guarantorSocialSecurity}
                      onChange={(e) =>
                        setGuarantorSocialSecurity(e.target.checked)
                      }
                    />

                    <span>الكفيل مشترك بالضمان الاجتماعي</span>
                  </label>

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

                  <div className="rounded-2xl border border-zinc-800 bg-black/40 p-4 text-sm leading-7 text-zinc-300">
                    يشترط في هذا المسار أن يكون الكفيل مشتركًا بالضمان وأن تكون
                    صلة القرابة من الخيارات المقبولة حسب سياسة المعرض.
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-zinc-800 bg-black/50 p-5 shadow-2xl">
            <h2 className="mb-2 text-2xl font-bold">5. رفع صور الهويات</h2>

            <p className="mb-5 text-sm leading-7 text-zinc-300">
              يمكنك تصوير الهوية مباشرة بالكاميرا أو اختيار صورة محفوظة من
              الجهاز. تأكد أن الصورة واضحة وغير مقصوصة.
            </p>

            <div className="grid gap-4 md:grid-cols-2">
              {uploadTypes.map((item) => {
                const file = files[item.key];
                const percent = progress[item.key];
                const previewUrl = previewUrls[item.key];

                return (
                  <div
                    key={item.key}
                    className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4"
                  >
                    <label className="mb-3 block font-bold">
                      {item.label}
                    </label>

                    <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-orange-500/40 bg-black/50 p-5 text-center transition hover:bg-black">
                      <span className="text-base font-black text-orange-300">
                        تصوير أو اختيار صورة
                      </span>

                      <span className="mt-2 text-xs leading-6 text-zinc-400">
                        على الموبايل سيظهر لك خيار الكاميرا أو المعرض حسب الجهاز.
                      </span>

                      <input
                        type="file"
                        accept="image/png,image/jpeg"
                        capture="environment"
                        onChange={(e) =>
                          handleFileChange(
                            item.key,
                            e.target.files?.[0] || null
                          )
                        }
                        className="hidden"
                      />
                    </label>

                    {file && (
                      <div className="mt-4 space-y-3">
                        {previewUrl && (
                          <div className="overflow-hidden rounded-2xl border border-zinc-700 bg-black">
                            <img
                              src={previewUrl}
                              alt={item.label}
                              className="max-h-72 w-full object-contain"
                            />
                          </div>
                        )}

                        <p className="break-words text-sm text-zinc-300">
                          {file.name} —{" "}
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>

                        <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-800">
                          <div
                            className="h-full bg-orange-500 transition-all duration-300"
                            style={{ width: `${percent}%` }}
                          />
                        </div>

                        <p className="text-sm text-orange-400">
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

          <section className="rounded-3xl border border-zinc-800 bg-black/50 p-5 shadow-2xl">
            <h2 className="mb-4 text-2xl font-bold">6. الإقرارات والرسوم</h2>

            <label className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
              <input
                type="checkbox"
                checked={financialClear}
                onChange={(e) => setFinancialClear(e.target.checked)}
              />

              <span>أتعهد بعدم وجود قضايا مالية عليّ</span>
            </label>

            <div className="mt-4 rounded-2xl border border-orange-700 bg-orange-950/40 p-5 leading-8">
              <strong>رسوم معالجة الطلب:</strong> 5 دنانير غير مستردة، تُدفع
              بعد تقديم الطلب عبر كليك أو إي فواتيركم أو محفظة إلكترونية
              معتمدة، لاستكمال مراجعة الملف والتقييم الأولي.
            </div>
          </section>

          <section className="rounded-3xl border border-zinc-800 bg-black/50 p-5 shadow-2xl">
            <details className="group rounded-2xl border border-zinc-800 bg-zinc-950/80 p-5">
              <summary className="cursor-pointer select-none text-xl font-bold text-white">
                عرض الشروط والأحكام
              </summary>

              <div className="mt-5 max-h-72 overflow-y-auto rounded-2xl border border-zinc-800 bg-black p-5 text-sm leading-8 text-zinc-300">
                <ul className="list-disc space-y-2 pr-5">
                  <li>
                    إذا كان مقدم الطلب مشتركًا بالضمان، يجب ألا يقل الراتب
                    الصافي عن 350 دينار أردني.
                  </li>
                  <li>
                    إذا كان مقدم الطلب غير مشترك بالضمان، يجب ألا يقل الراتب
                    الصافي عن 400 دينار أردني.
                  </li>
                  <li>
                    في حال عدم اشتراك مقدم الطلب بالضمان، يشترط أن يكون الكفيل
                    مشتركًا بالضمان الاجتماعي ومن صلة قرابة مقبولة.
                  </li>
                  <li>
                    لا يسمح بوجود أكثر من طلب فعّال لنفس الرقم الوطني أو نفس
                    الرقم الوطني للكفيل.
                  </li>
                  <li>
                    يجب تقديم هوية شخصية سارية لمقدم الطلب والكفيل، وجه أمامي
                    وخلفي.
                  </li>
                  <li>البيانات الخاطئة أو الناقصة تؤدي لرفض الطلب.</li>
                  <li>رسوم معالجة الطلب 5 دنانير غير مستردة.</li>
                  <li>دفع رسوم المعالجة لا يعني الموافقة على طلب التقسيط.</li>
                  <li>
                    الموافقة النهائية تتم بعد مراجعة الإدارة وتوقيع العقد في
                    المعرض.
                  </li>
                </ul>
              </div>
            </details>

            <label className="mt-4 flex items-start gap-3 rounded-2xl border border-orange-700 bg-orange-950/30 p-4 leading-7">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-2"
              />

              <span>أقرّ بأنني قرأت الشروط والأحكام وأوافق عليها.</span>
            </label>
          </section>

          <button
            disabled={isSubmitting}
            className="sticky bottom-4 w-full rounded-2xl bg-orange-500 p-5 text-lg font-black text-black shadow-2xl shadow-orange-500/20 transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "جاري إرسال الطلب..." : "إرسال الطلب الآن"}
          </button>
        </form>
      </div>
    </main>
  );
}