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

const legalRegistrationText =
  "الجهة المالكة والمشغلة للموقع هي Al Ameen for Financial Services، سجل تجاري رقم 728394، والرقم الوطني للمنشأة / الضريبي 102348761، بتاريخ تسجيل 15/03/2025.";

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
  const [submissionStep, setSubmissionStep] = useState("");
  const [submissionProgress, setSubmissionProgress] = useState(0);
  const [showPaymentTransition, setShowPaymentTransition] = useState(false);

  const [successTrackingId, setSuccessTrackingId] = useState("");
  const [successApplicationId, setSuccessApplicationId] = useState("");
  const [paymentDeadlineTime, setPaymentDeadlineTime] = useState<number | null>(
    null
  );
  const [timeLeft, setTimeLeft] = useState(60 * 60);
  const [showBeneficiaryName, setShowBeneficiaryName] = useState(false);
  const [paidClicked, setPaidClicked] = useState(false);
  const [paymentReceiptFile, setPaymentReceiptFile] = useState<File | null>(null);
  const [paymentReceiptPreviewUrl, setPaymentReceiptPreviewUrl] = useState("");
  const [paymentReceiptProgress, setPaymentReceiptProgress] = useState(0);
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
    if (!successTrackingId || paymentCompleted) return;

    const timeout = window.setTimeout(() => {
      setShowPaymentTransition(false);
    }, 2500);

    return () => window.clearTimeout(timeout);
  }, [successTrackingId, paymentCompleted]);

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

      if (paymentReceiptPreviewUrl) {
        URL.revokeObjectURL(paymentReceiptPreviewUrl);
      }
    };
  }, [previewUrls, paymentReceiptPreviewUrl]);

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
    return applicantSocialSecurity
      ? "applicant_social_security_optional"
      : "standard_application_no_social_security_required";
  }

  function getRequiredSalaryMinimum() {
    return 290;
  }

  function isActiveApplication(status: string | null) {
    return status !== "rejected" && status !== "cancelled";
  }

  async function checkDuplicateActiveApplication(params: {
    cleanNationalId: string;
    cleanGuarantorNationalId: string;
  }) {
    const { data, error } = await supabase
      .from("applications")
      .select(
        "id, tracking_id, status, national_id, guarantor_national_id, full_name"
      )
      .eq("national_id", params.cleanNationalId)
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

  function handlePaymentReceiptChange(file: File | null) {
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png"];
    const maxSize = 5 * 1024 * 1024;

    if (!allowedTypes.includes(file.type)) {
      alert("يُسمح فقط برفع صورة وصل بصيغة JPG أو PNG");
      return;
    }

    if (file.size > maxSize) {
      alert("حجم صورة الوصل يجب ألا يتجاوز 5MB");
      return;
    }

    if (paymentReceiptPreviewUrl) {
      URL.revokeObjectURL(paymentReceiptPreviewUrl);
    }

    setPaymentReceiptFile(file);
    setPaymentReceiptPreviewUrl(URL.createObjectURL(file));
    setPaymentReceiptProgress(0);

    let value = 0;
    const interval = window.setInterval(() => {
      value += 10;
      setPaymentReceiptProgress(value > 100 ? 100 : value);

      if (value >= 100) {
        window.clearInterval(interval);
      }
    }, 80);
  }

  function removePaymentReceipt() {
    if (paymentReceiptPreviewUrl) {
      URL.revokeObjectURL(paymentReceiptPreviewUrl);
    }

    setPaymentReceiptFile(null);
    setPaymentReceiptPreviewUrl("");
    setPaymentReceiptProgress(0);
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
    receiptUploaded: boolean;
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
          paymentReference: params.receiptUploaded
            ? "تم رفع صورة / سكرين شوت وصل الدفع"
            : "لم يتم رفع صورة وصل",
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

  function wait(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function updateSubmissionStatus(message: string, percent: number) {
    setSubmissionStep(message);
    setSubmissionProgress(Math.max(0, Math.min(100, percent)));
  }

  async function markPaidClicked() {
    if (!successTrackingId) return;

    if (timeLeft === 0) {
      alert("انتهت مهلة الدفع. يرجى تقديم طلب جديد أو التواصل مع الإدارة.");
      return;
    }

    if (!paymentReceiptFile) {
      alert("يرجى رفع صورة أو سكرين شوت لوصل الدفع قبل تأكيد الدفع.");
      return;
    }

    if (!successApplicationId) {
      alert("حدث خطأ في ربط الطلب بصورة الوصل. يرجى تحديث الصفحة أو التواصل مع الإدارة.");
      return;
    }

    setPaidClicked(true);

    try {
      const extension = paymentReceiptFile.type === "image/png" ? "png" : "jpg";
      const receiptPath = `${successTrackingId}/payment-receipt-${Date.now()}.${extension}`;
      const receiptUrl = await uploadFile(paymentReceiptFile, receiptPath);

      const { error: docError } = await supabase.from("documents").insert({
        application_id: successApplicationId,
        type: "payment_receipt",
        file_url: receiptUrl,
      });

      if (docError) throw docError;

      const { error } = await supabase
        .from("applications")
        .update({
          payment_status: "customer_claimed_paid",
          status: "pending_payment_confirmation",
          payment_reference: "payment_receipt_uploaded",
          paid_clicked_at: new Date().toISOString(),
        })
        .eq("tracking_id", successTrackingId);

      if (error) throw error;

      await sendPaymentConfirmedDiscordNotification({
        trackingId: successTrackingId,
        receiptUploaded: true,
      });

      setPaymentCompleted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error(error);
      alert("صار خطأ أثناء رفع وصل الدفع أو تسجيله. حاول مرة ثانية.");
      setPaidClicked(false);
    }
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
      return alert("الراتب الصافي يجب ألا يقل عن 290 دينار أردني");
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
      return alert("يرجى قراءة الشروط والأحكام بعناية ثم الموافقة عليها قبل إرسال الطلب.");
    }

    setIsSubmitting(true);
    updateSubmissionStatus("جاري فحص البيانات والتأكد من عدم وجود طلب مكرر...", 8);

    try {
      const duplicateApplication = await checkDuplicateActiveApplication({
        cleanNationalId,
        cleanGuarantorNationalId,
      });

      if (duplicateApplication) {
        alert(
          `لا يمكن تقديم طلب جديد. يوجد طلب فعّال لنفس مقدم الطلب.\nرقم التتبع: ${
            duplicateApplication.tracking_id || duplicateApplication.id
          }\nالحالة الحالية: ${duplicateApplication.status || "قيد المتابعة"}`
        );

        setIsSubmitting(false);
        setSubmissionStep("");
        setSubmissionProgress(0);
        return;
      }

      updateSubmissionStatus("جاري إنشاء طلب التمويل وحفظ البيانات...", 28);

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

      updateSubmissionStatus("جاري رفع صور الهويات والوثائق...", 45);

      for (const [index, item] of uploadTypes.entries()) {
        updateSubmissionStatus(
          `جاري رفع الوثائق (${index + 1} من ${uploadTypes.length})...`,
          45 + Math.round(((index + 1) / uploadTypes.length) * 30)
        );

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

      updateSubmissionStatus("جاري إرسال تنبيه الطلب للإدارة...", 84);

      await sendApplicationCreatedDiscordNotification({
        trackingId,
        cleanPhone,
        cleanGuarantorPhone,
        cleanGuarantorNationalId,
        eligibilityPath,
      });

      updateSubmissionStatus("تم استلام الطلب بنجاح، جاري تجهيز صفحة الدفع...", 100);
      setShowPaymentTransition(true);
      setPaymentDeadlineTime(deadlineMs);
      setTimeLeft(60 * 60);

      // مهم: نخلي شاشة جاري تقديم الطلب ظاهرة بوضوح قبل الانتقال لصفحة الدفع
      // حتى العميل ما يحس الصفحة علّقت أو اختفت فجأة.
      await wait(4200);

      setSuccessTrackingId(trackingId);
      setSuccessApplicationId(application.id);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error(error);
      setSubmissionStep("");
      setSubmissionProgress(0);
      alert("صار خطأ أثناء حفظ الطلب أو رفع الصور. ابعتلي صورة الخطأ.");
    } finally {
      setIsSubmitting(false);
      setSubmissionStep("");
    }
  }

  if (successTrackingId && paymentCompleted) {
    const trackHref = `/track?phone=${encodeURIComponent(
      cleanDigits(phone)
    )}&tracking=${encodeURIComponent(successTrackingId)}`;

    return (
      <main
        dir="rtl"
        className="relative min-h-screen overflow-x-hidden bg-[#03120e] px-4 py-10 text-white [padding-top:calc(2.5rem+env(safe-area-inset-top))]"
      >
        {showPaymentTransition && (
          <SubmittingOverlay
            message="تم استلام الطلب بنجاح، جاري تجهيز صفحة الدفع..."
            progress={100}
          />
        )}

        <div className="glass-panel-strong mx-auto max-w-3xl rounded-[2rem] p-8 text-center shadow-2xl">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[#69d97b] text-4xl text-black">
            ✓
          </div>

          <div className="mb-4 inline-flex rounded-full border border-[rgba(105,217,123,0.32)] bg-[rgba(105,217,123,0.10)] px-4 py-2 text-sm text-[#b8f3c0]">
            تم تسجيل الدفع بنجاح
          </div>

          <h1 className="text-4xl font-black">
            طلبك الآن بانتظار تأكيد الإدارة
          </h1>

          <p className="mx-auto mt-4 max-w-2xl leading-8 text-[#d7ddd5]">
            تم رفع صورة وصل الدفع، وسيتم التحقق من الدفع من قبل الإدارة.
            بعد التأكيد سيتم تحويل الطلب إلى مرحلة الدراسة.
          </p>

          <div className="mt-8 grid gap-4 text-right md:grid-cols-2">
            <div className="rounded-2xl border border-[rgba(214,181,107,0.16)] bg-[rgba(3,18,14,0.74)] p-5">
              <p className="text-sm text-[#aeb9af]">رقم التتبع</p>

              <p className="mt-2 break-words text-2xl font-black text-[#f3dfac]">
                {successTrackingId}
              </p>
            </div>

            <div className="rounded-2xl border border-[rgba(214,181,107,0.16)] bg-[rgba(3,18,14,0.74)] p-5">
              <p className="text-sm text-[#aeb9af]">وصل الدفع</p>

              <p className="mt-2 break-words text-2xl font-black text-[#69d97b]">
                تم رفع صورة الوصل ✅
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <Link
              href={trackHref}
              className="green-button rounded-2xl px-6 py-4 text-center text-base font-black transition"
            >
              تتبع حالة الطلب
            </Link>

            <Link
              href="/"
              className="soft-button rounded-2xl px-6 py-4 text-center text-base font-black transition"
            >
              العودة للرئيسية
            </Link>
          </div>

          <div className="mt-6 rounded-2xl border border-[rgba(214,181,107,0.16)] bg-[rgba(3,18,14,0.74)] p-5 text-sm leading-8 text-[#d7ddd5]">
            احتفظ برقم التتبع وصورة الوصل. قد تتواصل الإدارة معك للتأكد من
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
        className="relative min-h-screen overflow-x-hidden bg-[#03120e] px-4 py-10 text-white [padding-top:calc(2.5rem+env(safe-area-inset-top))]"
      >
        {showPaymentTransition && (
          <SubmittingOverlay
            message="تم استلام الطلب بنجاح، جاري تجهيز صفحة الدفع..."
            progress={100}
          />
        )}

        <div className="glass-panel-strong mx-auto max-w-3xl rounded-[2rem] p-8 shadow-2xl">
          <div className="mb-4 inline-flex rounded-full border border-[rgba(105,217,123,0.32)] bg-[rgba(105,217,123,0.10)] px-4 py-2 text-sm text-[#b8f3c0]">
            تم استلام الطلب بنجاح ✅
          </div>

          <h1 className="text-4xl font-black">
            خطوة الدفع لاستكمال المراجعة
          </h1>

          <p className="mt-4 leading-8 text-[#d7ddd5]">
            رقم طلبك هو:
            <strong className="mx-2 text-[#f3dfac]">
              {successTrackingId}
            </strong>
            يرجى دفع رسوم فتح الملف قبل انتهاء المهلة حتى لا يتم إلغاء الطلب
            تلقائيًا.
          </p>

          {selectedProduct && selectedInstallment && (
            <div className="mt-6 rounded-2xl border border-[rgba(214,181,107,0.24)] bg-[rgba(214,181,107,0.08)] p-5">
              <h2 className="text-xl font-black text-[#f3dfac]">
                ملخص الجهاز
              </h2>

              <div className="mt-4 grid gap-3 text-sm leading-7 text-[#d7ddd5] md:grid-cols-2">
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
            <p className="text-sm text-[#d7ddd5]">
              الوقت المتبقي قبل إلغاء الطلب
            </p>

            <p className="mt-2 text-4xl font-black text-red-300">
              {formatCountdown(timeLeft)}
            </p>

            <p className="mt-2 text-sm text-[#aeb9af]">
              مدة الدفع المتاحة: ساعة واحدة فقط
            </p>
          </div>

          <div className="mt-6 rounded-2xl border border-[rgba(214,181,107,0.24)] bg-[rgba(214,181,107,0.08)] p-5">
            <p className="text-xl font-black text-[#f3dfac]">
              رسوم فتح الملف: 5 دنانير
            </p>

            <p className="mt-2 text-sm text-[#d7ddd5]">
              يتم استرداد رسوم فتح الملف عند الموافقة على الطلب وتوقيع عقد الاستلام. دفع الرسوم لا يعني الموافقة النهائية على التقسيط.
            </p>
          </div>

          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-[rgba(214,181,107,0.16)] bg-[rgba(3,18,14,0.74)] p-5">
              <h2 className="text-2xl font-bold">كليك</h2>

              <p className="mt-3 text-[#d7ddd5]">اسم كليك:</p>

              <div className="mt-2 rounded-xl border border-[rgba(214,181,107,0.20)] bg-[rgba(2,18,14,0.92)] p-4 font-black text-[#f3dfac]">
                AMEENPAY
              </div>
            </div>

            <div className="rounded-2xl border border-[rgba(214,181,107,0.16)] bg-[rgba(3,18,14,0.74)] p-5">
              <h2 className="text-2xl font-bold">Orange Money</h2>

              <p className="mt-3 text-[#d7ddd5]">
                اسم المستفيد مخفي لحماية الخصوصية.
              </p>

              {!showBeneficiaryName ? (
                <button
                  type="button"
                  onClick={() => setShowBeneficiaryName(true)}
                  className="mt-4 rounded-xl bg-[#d6b56b] px-5 py-3 font-black text-black"
                >
                  إظهار اسم المستفيد
                </button>
              ) : (
                <div className="mt-4 rounded-xl border border-[rgba(214,181,107,0.20)] bg-[rgba(2,18,14,0.92)] p-4 font-bold text-[#f3dfac]">
                  ABDULRAHMAN AL HARAHSHEH
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-[rgba(214,181,107,0.16)] bg-[rgba(3,18,14,0.74)] p-5">
            <label className="mb-3 block text-lg font-black text-white">
              صورة / سكرين شوت وصل الدفع
            </label>

            <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-[rgba(214,181,107,0.34)] bg-[rgba(255,255,255,0.035)] p-5 text-center transition hover:bg-[rgba(255,255,255,0.06)]">
              <span className="text-base font-black text-[#f3dfac]">
                رفع صورة الوصل
              </span>

              <span className="mt-2 text-xs leading-6 text-[#aeb9af]">
                ارفع صورة أو سكرين شوت واضح يبيّن عملية الدفع. الصيغ المقبولة:
                JPG أو PNG.
              </span>

              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) =>
                  handlePaymentReceiptChange(e.target.files?.[0] || null)
                }
                className="hidden"
              />
            </label>

            {paymentReceiptFile && (
              <div className="mt-4 space-y-3">
                {paymentReceiptPreviewUrl && (
                  <div className="overflow-hidden rounded-2xl border border-[rgba(214,181,107,0.20)] bg-[rgba(2,18,14,0.92)]">
                    <img
                      src={paymentReceiptPreviewUrl}
                      alt="صورة وصل الدفع"
                      className="max-h-80 w-full object-contain"
                    />
                  </div>
                )}

                <p className="break-words text-sm text-[#d7ddd5]">
                  {paymentReceiptFile.name} —{" "}
                  {(paymentReceiptFile.size / 1024 / 1024).toFixed(2)} MB
                </p>

                <div className="h-3 w-full overflow-hidden rounded-full bg-[rgba(214,181,107,0.14)]">
                  <div
                    className="h-full bg-gradient-to-l from-[#d6b56b] to-[#69d97b] transition-all duration-300"
                    style={{ width: `${paymentReceiptProgress}%` }}
                  />
                </div>

                <p className="text-sm text-[#f3dfac]">
                  {paymentReceiptProgress < 100
                    ? `جارٍ تجهيز صورة الوصل... ${paymentReceiptProgress}%`
                    : "تم تجهيز صورة الوصل 100% ✅"}
                </p>

                <button
                  type="button"
                  onClick={removePaymentReceipt}
                  className="rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-2 text-sm font-black text-red-300 transition hover:bg-red-950"
                >
                  حذف صورة الوصل ورفع صورة أخرى
                </button>
              </div>
            )}

            <p className="mt-3 text-sm leading-7 text-[#aeb9af]">
              يجب رفع صورة الوصل قبل الضغط على تأكيد الدفع حتى تتمكن الإدارة من
              مطابقة العملية بسرعة.
            </p>
          </div>

          <button
            type="button"
            onClick={markPaidClicked}
            disabled={paidClicked || timeLeft === 0}
            className="green-button mt-6 w-full rounded-2xl p-5 text-lg font-black shadow-2xl transition disabled:cursor-not-allowed disabled:opacity-60"
          >
            {paidClicked ? "جاري رفع الوصل وتسجيل الدفع..." : "تأكيد الدفع"}
          </button>

          <div className="mt-6 rounded-2xl border border-[rgba(214,181,107,0.16)] bg-[rgba(3,18,14,0.74)] p-5 leading-8 text-[#d7ddd5]">
            بعد الضغط على “تأكيد الدفع”، سيتم رفع صورة الوصل ووضع الطلب بانتظار
            تأكيد الإدارة. احتفظ بصورة الوصل الأصلية لأن الإدارة قد تطلبها منك.
          </div>
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

      <div className="mx-auto max-w-5xl">
        <div className="site-shell pattern-lines mb-8 rounded-[2rem] p-8 shadow-2xl">
          <div className="gold-chip mb-4 inline-flex rounded-full px-4 py-2 text-sm font-black">
            الأمين للأقساط والتمويل — تجربة تقسيط فاخرة وآمنة
          </div>

          <h1 className="text-4xl font-black leading-tight md:text-6xl">
            قدّم طلب التقسيط خلال دقائق
          </h1>

          <p className="mt-4 max-w-2xl text-[#d7ddd5]">
            عبّئ البيانات بدقة، ارفع صور الهويات المطلوبة، وبعد تقديم الطلب يتم
            دفع رسوم فتح الملف 5 دنانير لاستكمال مراجعة الملف والتقييم الأولي، ويتم استردادها عند الموافقة على الطلب وتوقيع عقد الاستلام.
          </p>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <TrustCard
              title="جهة مسجلة"
              text="Al Ameen for Financial Services"
            />
            <TrustCard
              title="بياناتك للمراجعة فقط"
              text="لا نستخدم صور الهوية لأي غرض تسويقي."
            />
            <TrustCard
              title="تقديم أونلاين"
              text="الاستلام من مكاتبنا بعد الموافقة وتوقيع العقد."
            />
          </div>

          <div className="mt-5 rounded-2xl border border-[rgba(214,181,107,0.18)] bg-[rgba(255,255,255,0.04)] p-4">
            <p className="text-xs font-black text-[#f3dfac]">
              بيانات التسجيل والملكية
            </p>
            <p className="mt-2 text-sm font-bold leading-7 text-[#d7ddd5]">
              {legalRegistrationText}
            </p>
          </div>
        </div>

        {selectedProduct && selectedInstallment ? (
          <section className="glass-panel gold-outline mb-6 rounded-3xl p-5 shadow-2xl">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-bold text-[#f3dfac]">
                  الجهاز المختار
                </p>

                <h2 className="mt-2 text-2xl font-black text-white">
                  {selectedProduct.name}
                </h2>

                <p className="mt-1 text-sm text-[#d7ddd5]">
                  {selectedProduct.model}
                </p>
              </div>

              <Link
                href="/products"
                className="rounded-2xl border border-[rgba(214,181,107,0.30)] bg-[rgba(3,18,14,0.40)] px-5 py-3 text-center text-sm font-black text-[#f3dfac] transition hover:bg-[rgba(2,18,14,0.92)]"
              >
                تغيير الجهاز
              </Link>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              <InfoBox label="السعر" value={formatJod(selectedProduct.price)} />
              <InfoBox label="مدة التقسيط" value={`${selectedMonths} شهر`} />
              <InfoBox
                label="الدفعة الأولى"
                value={formatJod(selectedInstallment.downPayment)}
              />
              <InfoBox
                label="القسط التقريبي"
                value={formatJod(selectedInstallment.monthly)}
                highlight
              />
            </div>
          </section>
        ) : (
          <section className="glass-panel gold-outline mb-6 rounded-3xl p-5 shadow-2xl">
            <h2 className="text-xl font-black">طلب عام بدون جهاز محدد</h2>

            <p className="mt-2 text-sm leading-7 text-[#d7ddd5]">
              لم يتم اختيار جهاز من صفحة المنتجات. يمكنك متابعة الطلب العام، أو
              الرجوع لاختيار جهاز محدد.
            </p>

            <Link
              href="/products"
              className="gold-button mt-4 inline-flex rounded-2xl px-5 py-3 text-sm font-black"
            >
              اختيار جهاز
            </Link>
          </section>
        )}

        <form onSubmit={handleSubmit} autoComplete="on" className="space-y-6">
          <section className="glass-panel gold-outline rounded-3xl p-5 shadow-2xl">
            <h2 className="mb-4 text-2xl font-bold">1. بيانات مقدم الطلب</h2>

            <div className="space-y-4">
              <input
                name="name"
                autoComplete="name"
                className={inputClass}
                placeholder="الاسم الرباعي"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />

              <input
                name="national-id"
                autoComplete="off"
                inputMode="numeric"
                className={inputClass}
                placeholder="الرقم الوطني: يبدأ بـ 9 أو 2 — 10 أرقام"
                value={nationalId}
                maxLength={10}
                onChange={(e) =>
                  setNationalId(cleanDigits(e.target.value).slice(0, 10))
                }
              />

              <input
                name="tel"
                autoComplete="tel"
                inputMode="tel"
                className={inputClass}
                placeholder="رقم الهاتف: 079 / 078 / 077"
                value={phone}
                maxLength={10}
                onChange={(e) =>
                  setPhone(cleanDigits(e.target.value).slice(0, 10))
                }
              />

              <input
                name="email"
                type="email"
                autoComplete="email"
                className={inputClass}
                placeholder="البريد الإلكتروني"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </section>

          <section className="glass-panel gold-outline rounded-3xl p-5 shadow-2xl">
            <h2 className="mb-4 text-2xl font-bold">2. العنوان</h2>

            <div className="space-y-4">
              <select
                name="address-level1"
                autoComplete="address-level1"
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
                name="address-level2"
                autoComplete="address-level2"
                className={inputClass}
                placeholder="المدينة / المنطقة"
                value={cityArea}
                onChange={(e) => setCityArea(e.target.value)}
              />

              <input
                name="street-address"
                autoComplete="street-address"
                className={inputClass}
                placeholder="العنوان التفصيلي"
                value={detailedAddress}
                onChange={(e) => setDetailedAddress(e.target.value)}
              />

              <input
                name="address-line2"
                autoComplete="address-line2"
                className={inputClass}
                placeholder="أقرب معلم واضح"
                value={nearestLandmark}
                onChange={(e) => setNearestLandmark(e.target.value)}
              />
            </div>
          </section>

          <section className="glass-panel gold-outline rounded-3xl p-5 shadow-2xl">
            <h2 className="mb-4 text-2xl font-bold">3. بيانات العمل والدخل</h2>

            <div className="space-y-4">
              <input
                name="organization"
                autoComplete="organization"
                className={inputClass}
                placeholder="مكان العمل"
                value={employer}
                onChange={(e) => setEmployer(e.target.value)}
              />

              <input
                name="salary"
                autoComplete="off"
                inputMode="decimal"
                className={inputClass}
                placeholder="الراتب الصافي بالدينار — الحد الأدنى 290"
                type="number"
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
              />

              <div className="rounded-2xl border border-[rgba(214,181,107,0.24)] bg-[rgba(214,181,107,0.07)] p-4">
                <p className="mb-3 font-bold text-[#f3dfac]">
                  هل مقدم الطلب مشترك بالضمان الاجتماعي؟ <span className="text-[#aeb9af]">(اختياري)</span>
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

                <div className="mt-4 rounded-2xl border border-[rgba(214,181,107,0.16)] bg-[rgba(3,18,14,0.40)] p-4 text-sm leading-7 text-[#d7ddd5]">
                  التسجيل بالضمان الاجتماعي خيار يساعد في دراسة الطلب، لكنه غير إلزامي. الحد الأدنى للراتب الصافي هو 290 دينار أردني. يتم تقييم الطلب حسب البيانات والوثائق وسياسة الموافقة الداخلية.
                </div>
              </div>
            </div>
          </section>

          <section className="glass-panel gold-outline rounded-3xl p-5 shadow-2xl">
            <h2 className="mb-4 text-2xl font-bold">4. بيانات الكفيل</h2>

            <div className="space-y-4">
              <input
                name="guarantor-name"
                autoComplete="off"
                className={inputClass}
                placeholder="اسم الكفيل الرباعي"
                value={guarantorName}
                onChange={(e) => setGuarantorName(e.target.value)}
              />

              <input
                name="guarantor-national-id"
                autoComplete="off"
                inputMode="numeric"
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
                name="guarantor-tel"
                autoComplete="off"
                inputMode="tel"
                className={inputClass}
                placeholder="رقم هاتف الكفيل: 079 / 078 / 077"
                value={guarantorPhone}
                maxLength={10}
                onChange={(e) =>
                  setGuarantorPhone(cleanDigits(e.target.value).slice(0, 10))
                }
              />

              <div className="space-y-4 rounded-2xl border border-[rgba(214,181,107,0.24)] bg-[rgba(214,181,107,0.07)] p-4">
                <p className="font-bold text-[#f3dfac]">
                  معلومات إضافية عن الكفيل <span className="text-[#aeb9af]">(اختيارية)</span>
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

                <div className="rounded-2xl border border-[rgba(214,181,107,0.16)] bg-[rgba(255,255,255,0.035)] p-4 text-sm leading-7 text-[#d7ddd5]">
                  هذه المعلومات اختيارية وتساعد الإدارة على دراسة الطلب بشكل أوضح، لكنها ليست شرطًا إلزاميًا لإرسال الطلب. يمكن للكفيل تقديم طلب مستقل لاحقًا، ويمكن أن يكفل مقدم الطلب كفيله في طلب منفصل.
                </div>
              </div>
            </div>
          </section>

          <section className="glass-panel gold-outline rounded-3xl p-5 shadow-2xl">
            <h2 className="mb-2 text-2xl font-bold">5. رفع صور الهويات</h2>

            <p className="mb-5 text-sm leading-7 text-[#d7ddd5]">
              يمكنك اختيار صور الهويات من معرض الصور أو الملفات، أو تصويرها مباشرة
              إذا رغبت. تأكد أن الصورة واضحة، كاملة، وغير مقصوصة.
            </p>

            <div className="mb-5 grid gap-3 md:grid-cols-3">
              <TrustCard
                title="لماذا نطلب الهوية؟"
                text="للتحقق من بيانات مقدم الطلب والكفيل ودراسة أهلية التمويل فقط."
              />
              <TrustCard
                title="استخدام محدود"
                text="لا يتم استخدام صور الهوية لأي إعلان أو تسويق أو عرض عام."
              />
              <TrustCard
                title="مراجعة داخلية فقط"
                text="الوثائق تظهر فقط للإدارة المخولة بمراجعة الطلبات."
              />
            </div>

            <div className="mb-5 rounded-2xl border border-[rgba(105,217,123,0.28)] bg-[rgba(7,49,38,0.45)] p-4">
              <p className="text-sm font-black text-[#b8f3c0]">
                تعهّد الخصوصية
              </p>
              <p className="mt-2 text-sm font-bold leading-7 text-[#d7ddd5]">
                يتم استخدام صور الهويات والوثائق فقط لدراسة طلب التمويل والتحقق
                من البيانات، ولا يتم نشرها أو بيعها أو استخدامها لأي غرض تسويقي.
              </p>
            </div>

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
                    <label className="mb-3 block font-bold">
                      {item.label}
                    </label>

                    <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-[rgba(214,181,107,0.34)] bg-[rgba(3,18,14,0.50)] p-5 text-center transition hover:bg-[rgba(2,18,14,0.92)]">
                      <span className="text-base font-black text-[#f3dfac]">
                        اختيار صورة أو تصوير الهوية
                      </span>

                      <span className="mt-2 text-xs leading-6 text-[#aeb9af]">
                        يمكنك اختيار صورة محفوظة من الجهاز أو تصوير الهوية حسب
                        الخيارات المتاحة في هاتفك.
                      </span>

                      <input
                        type="file"
                        accept="image/png,image/jpeg"
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
                          <div className="overflow-hidden rounded-2xl border border-[rgba(214,181,107,0.20)] bg-[rgba(2,18,14,0.92)]">
                            <img
                              src={previewUrl}
                              alt={item.label}
                              className="max-h-72 w-full object-contain"
                            />
                          </div>
                        )}

                        <p className="break-words text-sm text-[#d7ddd5]">
                          {file.name} —{" "}
                          {(file.size / 1024 / 1024).toFixed(2)} MB
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
            <h2 className="mb-4 text-2xl font-bold">6. الإقرارات والرسوم</h2>

            <label className="flex items-center gap-3 rounded-2xl border border-[rgba(214,181,107,0.16)] bg-[rgba(3,18,14,0.74)] p-4">
              <input
                type="checkbox"
                checked={financialClear}
                onChange={(e) => setFinancialClear(e.target.checked)}
              />

              <span>أتعهد بعدم وجود قضايا مالية عليّ</span>
            </label>

            <div className="mt-4 rounded-2xl border border-[rgba(214,181,107,0.24)] bg-[rgba(214,181,107,0.08)] p-5 leading-8">
              <strong>رسوم فتح الملف:</strong> 5 دنانير، تُدفع
              بعد تقديم الطلب عبر كليك أو إي فواتيركم أو محفظة إلكترونية
              معتمدة، لاستكمال مراجعة الملف والتقييم الأولي. يتم استرداد رسوم فتح الملف عند الموافقة على الطلب وتوقيع عقد الاستلام. دفع الرسوم لا يعني
              الموافقة النهائية على طلب التقسيط.
            </div>
          </section>

          <section className="glass-panel gold-outline rounded-3xl p-5 shadow-2xl">
            <div className="rounded-2xl border border-[rgba(214,181,107,0.28)] bg-[rgba(214,181,107,0.08)] p-5">
              <h2 className="text-2xl font-black text-[#f3dfac]">
                يرجى قراءة الشروط والأحكام بعناية قبل إرسال الطلب
              </h2>

              <p className="mt-3 text-sm font-bold leading-7 text-[#d7ddd5]">
                الشروط ظاهرة هنا بشكل مباشر حتى تكون واضحة قبل إرسال الطلب.
              </p>
            </div>

            <div className="mt-4 max-h-96 overflow-y-auto rounded-2xl border border-[rgba(214,181,107,0.16)] bg-[rgba(2,18,14,0.92)] p-5 text-sm leading-8 text-[#d7ddd5]">
              <ul className="list-disc space-y-2 pr-5">
                <li>{legalRegistrationText}</li>
                <li>الحد الأدنى للراتب الصافي لقبول دراسة الطلب هو 290 دينار أردني.</li>
                <li>لا يشترط أن يكون مقدم الطلب مسجلًا في الضمان الاجتماعي.</li>
                <li>خيار الضمان الاجتماعي موجود كمعلومة إضافية تساعد في دراسة الطلب، لكنه غير إلزامي.</li>
                <li>وجود كفيل مطلوب لإرسال الطلب، أما اشتراك الكفيل في الضمان الاجتماعي فهو خيار إضافي غير إلزامي.</li>
                <li>
                  لا يسمح بوجود أكثر من طلب فعّال لنفس مقدم الطلب. ويمكن للكفيل
                  تقديم طلب مستقل، كما يمكن أن يكفل مقدم الطلب كفيله في طلب
                  منفصل.
                </li>
                <li>
                  يجب تقديم هوية شخصية سارية لمقدم الطلب والكفيل، وجه أمامي
                  وخلفي.
                </li>
                <li>
                  صور الهويات والوثائق تستخدم فقط لدراسة طلب التمويل والتحقق
                  من البيانات.
                </li>
                <li>البيانات الخاطئة أو الناقصة تؤدي لرفض الطلب.</li>
                <li>
                  يتم استرداد رسوم فتح الملف عند الموافقة على الطلب وتوقيع عقد الاستلام.
                </li>
                <li>دفع رسوم فتح الملف لا يعني الموافقة النهائية على طلب التقسيط.</li>
                <li>
                  الموافقة النهائية تتم بعد مراجعة الإدارة وتوقيع العقد في
                  مكاتبنا.
                </li>
              </ul>
            </div>

            <label className="mt-4 flex items-start gap-3 rounded-2xl border border-[rgba(214,181,107,0.24)] bg-[rgba(214,181,107,0.07)] p-4 leading-7">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-2"
              />

              <span>
                أقرّ بأنني قرأت الشروط والأحكام بعناية وأوافق عليها، وأوافق على
                استخدام بياناتي والوثائق المرفوعة لغرض دراسة طلب التمويل فقط.
              </span>
            </label>
          </section>

          <button
            disabled={isSubmitting}
            className="green-button sticky bottom-4 w-full rounded-2xl p-5 text-lg font-black shadow-2xl disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "جاري تقديم الطلب..." : "إرسال الطلب الآن"}
          </button>
        </form>
      </div>
    </main>
  );
}

function InfoBox({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="stat-chip rounded-2xl p-4">
      <p className="text-xs text-[#aeb9af]">{label}</p>

      <p
        className={`mt-1 text-lg font-black ${
          highlight ? "gold-text" : "text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function TrustCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-[rgba(214,181,107,0.16)] bg-[rgba(255,255,255,0.035)] p-4">
      <p className="text-sm font-black text-[#f3dfac]">{title}</p>
      <p className="mt-2 text-xs font-bold leading-6 text-[#aeb9af]">{text}</p>
    </div>
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

  const steps = [
    { label: "فحص البيانات", active: safeProgress >= 8, done: safeProgress >= 25 },
    { label: "حفظ الطلب", active: safeProgress >= 28, done: safeProgress >= 45 },
    { label: "رفع الوثائق", active: safeProgress >= 45, done: safeProgress >= 84 },
    { label: "تجهيز الدفع", active: safeProgress >= 84, done: safeProgress >= 100 },
  ];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#03120e]/95 px-4 backdrop-blur-xl">
      <div className="w-full max-w-md rounded-[2rem] border border-[rgba(214,181,107,0.30)] bg-[rgba(3,18,14,0.96)] p-7 text-center shadow-2xl">
        <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-full border border-[rgba(214,181,107,0.30)] bg-[rgba(214,181,107,0.10)] shadow-[0_0_45px_rgba(105,217,123,0.18)]">
          <div className="relative flex h-16 w-16 items-center justify-center">
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-[#69d97b] border-t-transparent" />
            <div className="absolute inset-2 animate-pulse rounded-full border border-[#d6b56b]/60" />
            <span className="text-sm font-black text-[#f3dfac]">
              {safeProgress}%
            </span>
          </div>
        </div>

        <div className="mb-3 inline-flex rounded-full border border-[rgba(214,181,107,0.30)] bg-[rgba(214,181,107,0.10)] px-4 py-2 text-xs font-black text-[#f3dfac]">
          لا تغلق الصفحة — الطلب قيد المعالجة
        </div>

        <h2 className="text-2xl font-black text-white">جاري تقديم الطلب...</h2>

        <p className="mt-4 min-h-[56px] text-sm font-bold leading-7 text-[#d7ddd5]">
          {message || "يتم الآن معالجة الطلب ورفع الوثائق، يرجى الانتظار."}
        </p>

        <div className="mt-5 h-4 overflow-hidden rounded-full bg-[rgba(214,181,107,0.14)]">
          <div
            className="h-full rounded-full bg-gradient-to-l from-[#d6b56b] via-[#69d97b] to-[#35c98e] transition-all duration-700"
            style={{ width: `${safeProgress}%` }}
          />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 text-right">
          {steps.map((step) => (
            <div
              key={step.label}
              className={`rounded-2xl border px-3 py-3 text-xs font-black ${
                step.done
                  ? "border-[rgba(105,217,123,0.30)] bg-[rgba(105,217,123,0.10)] text-[#b8f3c0]"
                  : step.active
                  ? "border-[rgba(214,181,107,0.30)] bg-[rgba(214,181,107,0.10)] text-[#f3dfac]"
                  : "border-[rgba(214,181,107,0.16)] bg-[rgba(255,255,255,0.035)] text-[#aeb9af]"
              }`}
            >
              <span className="ml-2">{step.done ? "✓" : step.active ? "…" : "•"}</span>
              {step.label}
            </div>
          ))}
        </div>

        <p className="mt-4 text-xs font-bold leading-6 text-[#8d998f]">
          قد تستغرق العملية عدة ثوانٍ حسب سرعة الإنترنت وحجم الصور. لا تضغط رجوع ولا تغلق الصفحة.
        </p>
      </div>
    </div>
  );
}
