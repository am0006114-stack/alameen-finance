"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { getProductById } from "../../lib/products";
import { calculateInstallment, formatJod } from "../../lib/installments";

type UploadKey = "applicantIdFront" | "applicantIdBack";

type ExistingApplication = {
  id: string;
  tracking_id: string | null;
  status: string | null;
  national_id: string | null;
  guarantor_national_id: string | null;
  full_name: string | null;
};

type DeviceColorOption = {
  value: string;
  label: string;
  hint?: string;
};

const fallbackDeviceColorOptions: DeviceColorOption[] = [
  { value: "Black", label: "أسود", hint: "الخيار الأكثر طلبًا" },
  { value: "White", label: "أبيض", hint: "هادئ ورسمي" },
  { value: "Silver", label: "فضي", hint: "مناسب لمعظم الأجهزة" },
  { value: "Gold", label: "ذهبي", hint: "حسب توفر المورد" },
  { value: "Blue", label: "أزرق", hint: "حسب توفر المورد" },
  { value: "حسب المتوفر", label: "حسب المتوفر", hint: "اترك الاختيار للإدارة" },
];

function uniqueColorOptions(options: DeviceColorOption[]) {
  const seen = new Set<string>();

  return options.filter((option) => {
    const key = option.value.toLowerCase();

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

function getDeviceColorOptions(productName: string, brand: string): DeviceColorOption[] {
  const name = productName.toLowerCase();

  if (brand === "Apple") {
    if (name.includes("17 pro")) {
      return [
        { value: "Cosmic Orange", label: "برتقالي كوني / Cosmic Orange", hint: "لون قوي ومميز" },
        { value: "Deep Blue", label: "أزرق غامق / Deep Blue", hint: "رسمي وفخم" },
        { value: "Silver", label: "فضي / Silver", hint: "كلاسيكي" },
        { value: "حسب المتوفر", label: "حسب المتوفر", hint: "الإدارة تختار المتاح" },
      ];
    }

    if (name.includes("iphone 17")) {
      return [
        { value: "Black", label: "أسود / Black", hint: "الأكثر أمانًا" },
        { value: "Lavender", label: "لافندر / Lavender", hint: "لون ناعم" },
        { value: "Mist Blue", label: "أزرق ضبابي / Mist Blue", hint: "هادئ" },
        { value: "Sage", label: "أخضر Sage", hint: "مختلف" },
        { value: "White", label: "أبيض / White", hint: "كلاسيكي" },
        { value: "حسب المتوفر", label: "حسب المتوفر", hint: "الإدارة تختار المتاح" },
      ];
    }

    if (name.includes("air")) {
      return [
        { value: "Space Black", label: "أسود / Space Black", hint: "فخم" },
        { value: "Cloud White", label: "أبيض / Cloud White", hint: "نظيف" },
        { value: "Light Gold", label: "ذهبي فاتح / Light Gold", hint: "راقي" },
        { value: "Sky Blue", label: "أزرق سماوي / Sky Blue", hint: "هادئ" },
        { value: "حسب المتوفر", label: "حسب المتوفر", hint: "الإدارة تختار المتاح" },
      ];
    }

    return [
      { value: "Black", label: "أسود", hint: "مطلوب دائمًا" },
      { value: "White", label: "أبيض", hint: "كلاسيكي" },
      { value: "Blue", label: "أزرق", hint: "حسب الموديل" },
      { value: "Pink", label: "وردي", hint: "حسب الموديل" },
      { value: "Green", label: "أخضر", hint: "حسب الموديل" },
      { value: "حسب المتوفر", label: "حسب المتوفر", hint: "الإدارة تختار المتاح" },
    ];
  }

  if (brand === "Samsung") {
    if (name.includes("s26")) {
      return [
        { value: "Cobalt Violet", label: "بنفسجي كوبالت / Cobalt Violet", hint: "لون مميز" },
        { value: "Sky Blue", label: "أزرق سماوي / Sky Blue", hint: "هادئ" },
        { value: "Black", label: "أسود / Black", hint: "الأكثر طلبًا" },
        { value: "White", label: "أبيض / White", hint: "كلاسيكي" },
        { value: "Silver Shadow", label: "فضي شادو / Silver Shadow", hint: "قد يكون حصريًا أونلاين" },
        { value: "Pink Gold", label: "ذهبي وردي / Pink Gold", hint: "قد يكون حصريًا أونلاين" },
        { value: "حسب المتوفر", label: "حسب المتوفر", hint: "الإدارة تختار المتاح" },
      ];
    }

    return [
      { value: "Black", label: "أسود", hint: "الأكثر طلبًا" },
      { value: "Silver", label: "فضي", hint: "كلاسيكي" },
      { value: "Blue", label: "أزرق", hint: "حسب الموديل" },
      { value: "Gray", label: "رمادي", hint: "حسب الموديل" },
      { value: "حسب المتوفر", label: "حسب المتوفر", hint: "الإدارة تختار المتاح" },
    ];
  }

  if (brand === "HONOR") {
    if (name.includes("600 pro")) {
      return [
        { value: "Orange", label: "برتقالي / Orange", hint: "لون قوي ومميز" },
        { value: "White", label: "أبيض / White", hint: "نظيف" },
        { value: "Black", label: "أسود / Black", hint: "رسمي" },
        { value: "حسب المتوفر", label: "حسب المتوفر", hint: "الإدارة تختار المتاح" },
      ];
    }

    if (name.includes("600")) {
      return [
        { value: "Orange", label: "برتقالي / Orange", hint: "مميز" },
        { value: "Black", label: "أسود / Black", hint: "رسمي" },
        { value: "Golden White", label: "أبيض ذهبي / Golden White", hint: "راقي" },
        { value: "حسب المتوفر", label: "حسب المتوفر", hint: "الإدارة تختار المتاح" },
      ];
    }

    return [
      { value: "Black", label: "أسود", hint: "رسمي" },
      { value: "Green", label: "أخضر", hint: "حسب التوفر" },
      { value: "Gold", label: "ذهبي", hint: "حسب التوفر" },
      { value: "Silver", label: "فضي", hint: "حسب التوفر" },
      { value: "حسب المتوفر", label: "حسب المتوفر", hint: "الإدارة تختار المتاح" },
    ];
  }

  if (brand === "TECNO") {
    if (name.includes("camon 40")) {
      return [
        { value: "Galaxy Black", label: "أسود جالكسي / Galaxy Black", hint: "فخم" },
        { value: "Sandy Titanium", label: "تايتينيوم رملي / Sandy Titanium", hint: "راقي" },
        { value: "Emerald Lake Green", label: "أخضر زمردي / Emerald Lake Green", hint: "مميز" },
        { value: "حسب المتوفر", label: "حسب المتوفر", hint: "الإدارة تختار المتاح" },
      ];
    }

    return [
      { value: "Black", label: "أسود", hint: "الأكثر طلبًا" },
      { value: "Silver", label: "فضي", hint: "حسب التوفر" },
      { value: "Green", label: "أخضر", hint: "حسب التوفر" },
      { value: "Gold", label: "ذهبي", hint: "حسب التوفر" },
      { value: "حسب المتوفر", label: "حسب المتوفر", hint: "الإدارة تختار المتاح" },
    ];
  }

  return fallbackDeviceColorOptions;
}

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
];

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

  const deviceColorOptions = useMemo(() => {
    if (!selectedProduct) return [];

    return uniqueColorOptions(
      getDeviceColorOptions(selectedProduct.name, selectedProduct.brand)
    );
  }, [selectedProduct]);

  const [fullName, setFullName] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [governorate, setGovernorate] = useState("");
  const [cityArea, setCityArea] = useState("");
  const [detailedAddress, setDetailedAddress] = useState("");
  const [nearestLandmark, setNearestLandmark] = useState("");
  const [locationLatitude, setLocationLatitude] = useState<number | null>(null);
  const [locationLongitude, setLocationLongitude] = useState<number | null>(null);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [locationCapturedAt, setLocationCapturedAt] = useState("");
  const [locationStatus, setLocationStatus] = useState("");
  const [isLocating, setIsLocating] = useState(false);
  const [employer, setEmployer] = useState("");
  const [salary, setSalary] = useState("");
  const [selectedDeviceColor, setSelectedDeviceColor] = useState("");
  const [deviceColorNote, setDeviceColorNote] = useState("");

  const [applicantSocialSecurity, setApplicantSocialSecurity] = useState(true);
  const [financialClear, setFinancialClear] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionStep, setSubmissionStep] = useState("");
  const [submissionProgress, setSubmissionProgress] = useState(0);
  const [showPaymentTransition, setShowPaymentTransition] = useState(false);

  const [successTrackingId, setSuccessTrackingId] = useState("");
  const [currentStep, setCurrentStep] = useState(1);

  const steps = [
    { number: 1, title: "بياناتك" },
    { number: 2, title: "الموقع والدخل" },
    { number: 3, title: "الجهاز والهوية" },
    { number: 4, title: "المراجعة والإرسال" },
  ];

  const [files, setFiles] = useState<Record<UploadKey, File | null>>({
    applicantIdFront: null,
    applicantIdBack: null,
  });

  const [previewUrls, setPreviewUrls] = useState<Record<UploadKey, string>>({
    applicantIdFront: "",
    applicantIdBack: "",
  });

  const [progress, setProgress] = useState<Record<UploadKey, number>>({
    applicantIdFront: 0,
    applicantIdBack: 0,
  });

  useEffect(() => {
    setSelectedDeviceColor("");
    setDeviceColorNote("");
  }, [selectedProduct?.id]);

  useEffect(() => {
    if (!successTrackingId) return;

    const timeout = window.setTimeout(() => {
      setShowPaymentTransition(false);
    }, 2500);

    return () => window.clearTimeout(timeout);
  }, [successTrackingId]);

  useEffect(() => {
    return () => {
      Object.values(previewUrls).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, [previewUrls]);

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

  function requestLocation() {
    if (isLocating) return;

    if (!("geolocation" in navigator)) {
      setLocationStatus("المتصفح لا يدعم تحديد الموقع. يمكنك إكمال الطلب بدون GPS.");
      return;
    }

    setIsLocating(true);
    setLocationStatus("جاري تحديد موقعك...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationLatitude(position.coords.latitude);
        setLocationLongitude(position.coords.longitude);
        setLocationAccuracy(position.coords.accuracy);
        setLocationCapturedAt(new Date().toISOString());
        setLocationStatus("تم تحديد موقعك بنجاح ✅");
        setIsLocating(false);
      },
      (error) => {
        let message = "تعذر تحديد الموقع. يمكنك إكمال الطلب بدون GPS.";

        if (error.code === error.PERMISSION_DENIED) {
          message = "تم رفض إذن الموقع. يمكنك إكمال الطلب بدون GPS.";
        }

        if (error.code === error.POSITION_UNAVAILABLE) {
          message = "الموقع غير متاح حالياً. يمكنك إكمال الطلب بدون GPS.";
        }

        if (error.code === error.TIMEOUT) {
          message = "انتهت مهلة تحديد الموقع. حاول مرة أخرى أو أكمل الطلب بدون GPS.";
        }

        setLocationStatus(message);
        setIsLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      }
    );
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
          locationLatitude,
          locationLongitude,
          locationAccuracy,
          locationCapturedAt,
          applicantSocialSecurity,
          eligibilityPath: params.eligibilityPath,
          deviceId: selectedProduct?.id || "",
          deviceName: selectedProduct
            ? `${selectedProduct.name} - ${selectedProduct.model}${
                selectedDeviceColor ? ` - اللون المطلوب: ${selectedDeviceColor}` : ""
              }${
                deviceColorNote.trim()
                  ? ` - ملاحظة اللون: ${deviceColorNote.trim()}`
                  : ""
              }`
            : "",
          devicePrice: selectedProduct?.price || "",
          installmentMonths: selectedProduct ? selectedMonths : "",
          downPayment: selectedProduct ? selectedDownPayment : "",
          monthlyPayment: selectedInstallment?.monthly || "",
          status: "preliminary_application",
          paymentStatus: "not_requested_yet",
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

  function wait(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function updateSubmissionStatus(message: string, percent: number) {
    setSubmissionStep(message);
    setSubmissionProgress(Math.max(0, Math.min(100, percent)));
  }

  function validateStep(step: number) {
    const cleanPhone = cleanDigits(phone);
    const cleanNationalId = cleanDigits(nationalId);
    const salaryNumber = Number(salary);
    const cleanSelectedDeviceColor = selectedDeviceColor.trim();

    if (step === 1) {
      if (fullName.trim().split(/\s+/).length < 4) {
        alert("الاسم لازم يكون رباعي");
        return false;
      }

      if (!validNationalId(cleanNationalId)) {
        alert("الرقم الوطني يجب أن يبدأ بـ 9 أو 2 وأن يكون 10 أرقام");
        return false;
      }

      if (!validJordanPhone(cleanPhone)) {
        alert("رقم الهاتف يجب أن يبدأ بـ 079 أو 078 أو 077 وأن يكون 10 أرقام");
        return false;
      }

      if (email.trim() && (!email.includes("@") || !email.includes("."))) {
        alert("الإيميل غير صحيح");
        return false;
      }

      return true;
    }

    if (step === 2) {
      if (!governorate) {
        alert("يرجى اختيار المحافظة");
        return false;
      }

      if (Number.isNaN(salaryNumber)) {
        alert("يرجى إدخال الراتب الصافي بشكل صحيح");
        return false;
      }

      if (salaryNumber < getRequiredSalaryMinimum()) {
        alert("الراتب الصافي يجب ألا يقل عن 290 دينار أردني");
        return false;
      }

      return true;
    }

    if (step === 3) {
      if (selectedProduct && !cleanSelectedDeviceColor) {
        alert("يرجى اختيار لون الجهاز المطلوب قبل المتابعة.");
        return false;
      }

      for (const item of uploadTypes) {
        if (!files[item.key]) {
          alert("يرجى رفع صورة هوية مقدم الطلب من الأمام والخلف.");
          return false;
        }
      }

      return true;
    }

    if (step === 4) {
      if (!financialClear) {
        alert("يجب الإقرار بعدم وجود قضايا مالية");
        return false;
      }

      if (!termsAccepted) {
        alert("يرجى قراءة الشروط والأحكام بعناية ثم الموافقة عليها قبل إرسال الطلب.");
        return false;
      }

      return true;
    }

    return true;
  }

  function goToNextStep() {
    if (!validateStep(currentStep)) return;
    setCurrentStep((prev) => Math.min(prev + 1, steps.length));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goToPreviousStep() {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (isSubmitting) return;

    const cleanPhone = cleanDigits(phone);
    const cleanNationalId = cleanDigits(nationalId);
    const salaryNumber = Number(salary);
    const requiredSalaryMinimum = getRequiredSalaryMinimum();
    const eligibilityPath = getEligibilityPath();
    const cleanSelectedDeviceColor = selectedDeviceColor.trim();
    const cleanDeviceColorNote = deviceColorNote.trim();

    if (selectedProduct && !cleanSelectedDeviceColor) {
      return alert("يرجى اختيار لون الجهاز المطلوب قبل إرسال الطلب.");
    }

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

    if (email.trim() && (!email.includes("@") || !email.includes("."))) {
      return alert("الإيميل غير صحيح");
    }

    if (!governorate) {
      return alert("يرجى اختيار المحافظة");
    }

    if (Number.isNaN(salaryNumber)) {
      return alert("يرجى إدخال الراتب الصافي بشكل صحيح");
    }

    if (salaryNumber < requiredSalaryMinimum) {
      return alert("الراتب الصافي يجب ألا يقل عن 290 دينار أردني");
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

      updateSubmissionStatus("جاري إنشاء طلب الموافقة المبدئية وحفظ البيانات...", 28);

      const trackingId = "AM-" + Date.now();
      const deviceName = selectedProduct
        ? `${selectedProduct.name} - ${selectedProduct.model}${
            cleanSelectedDeviceColor
              ? ` - اللون المطلوب: ${cleanSelectedDeviceColor}`
              : ""
          }${
            cleanDeviceColorNote
              ? ` - ملاحظة اللون: ${cleanDeviceColorNote}`
              : ""
          }`
        : null;

      const { data: application, error: appError } = await supabase
        .from("applications")
        .insert({
          tracking_id: trackingId,
          full_name: fullName.trim(),
          national_id: cleanNationalId,
          phone: cleanPhone,
          email: email.trim() || null,
          governorate,
          city_area: cityArea.trim() || null,
          detailed_address: detailedAddress.trim() || null,
          nearest_landmark: nearestLandmark.trim() || null,
          location_latitude: locationLatitude,
          location_longitude: locationLongitude,
          location_accuracy: locationAccuracy,
          location_captured_at: locationCapturedAt || null,
          employer: employer.trim() || null,
          salary: salaryNumber,

          social_security: applicantSocialSecurity,
          applicant_social_security: applicantSocialSecurity,
          guarantor_social_security: false,
          guarantor_relationship: null,
          guarantor_national_id: null,
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

          guarantor_name: null,
          guarantor_phone: null,
          financial_clear: financialClear,
          terms_accepted: termsAccepted,
          status: "preliminary_application",
          payment_status: "not_requested_yet",
          payment_deadline: null,
        })
        .select()
        .single();

      if (appError) throw appError;

      updateSubmissionStatus("جاري رفع صور هوية مقدم الطلب...", 45);

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
        eligibilityPath,
      });

      updateSubmissionStatus("تم استلام الطلب بنجاح، بانتظار مراجعة الإدارة...", 100);
      setShowPaymentTransition(true);
      // نخلي شاشة جاري تقديم الطلب ظاهرة بوضوح حتى العميل يعرف أن الطلب وصل.
      await wait(2800);

      setSuccessTrackingId(trackingId);
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

  if (successTrackingId) {
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
            message="تم استلام الطلب بنجاح، بانتظار مراجعة الإدارة..."
            progress={100}
          />
        )}

        <div className="glass-panel-strong mx-auto max-w-3xl rounded-[2rem] p-8 text-center shadow-2xl">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[#69d97b] text-4xl text-black">
            ✓
          </div>

          <div className="mb-4 inline-flex rounded-full border border-[rgba(105,217,123,0.32)] bg-[rgba(105,217,123,0.10)] px-4 py-2 text-sm text-[#b8f3c0]">
            تم إرسال الطلب المبدئي بنجاح
          </div>

          <h1 className="text-4xl font-black">طلبك وصل للإدارة</h1>

          <p className="mx-auto mt-4 max-w-2xl leading-8 text-[#d7ddd5]">
            تم استلام طلبك كموافقة مبدئية. لن يُطلب منك الدفع الآن. ستقوم
            الإدارة بمراجعة البيانات أولًا، ثم سيتم التواصل معك عبر واتساب حسب
            نتيجة المراجعة: مؤهل مبدئيًا، بحاجة كشف راتب، أو مرفوض.
          </p>

          <div className="mt-8 grid gap-4 text-right md:grid-cols-2">
            <div className="rounded-2xl border border-[rgba(214,181,107,0.16)] bg-[rgba(3,18,14,0.74)] p-5">
              <p className="text-sm text-[#aeb9af]">رقم التتبع</p>

              <p className="mt-2 break-words text-2xl font-black text-[#f3dfac]">
                {successTrackingId}
              </p>
            </div>

            <div className="rounded-2xl border border-[rgba(214,181,107,0.16)] bg-[rgba(3,18,14,0.74)] p-5">
              <p className="text-sm text-[#aeb9af]">حالة الطلب</p>

              <p className="mt-2 break-words text-2xl font-black text-[#69d97b]">
                طلب مبدئي قيد المراجعة
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-[rgba(214,181,107,0.24)] bg-[rgba(214,181,107,0.08)] p-5 text-right leading-8 text-[#d7ddd5]">
            <p className="font-black text-[#f3dfac]">ماذا يحدث بعد ذلك؟</p>
            <ul className="mt-3 list-disc space-y-2 pr-5 text-sm">
              <li>إذا كان الطلب مؤهلًا مبدئيًا، سيتم التواصل معك عبر واتساب لاستكمال الخطوات التالية.</li>
              <li>إذا احتجنا كشف راتب، سيتم إرسال طلب واضح عبر واتساب.</li>
              <li>إذا لم تنطبق الشروط، سيتم إبلاغك بالنتيجة.</li>
            </ul>
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
            احصل على موافقة مبدئية خلال دقائق
          </h1>

          <p className="mt-4 max-w-2xl text-[#d7ddd5]">
            عبّئ بياناتك الأساسية فقط وارفع هوية مقدم الطلب. لن يتم طلب الدفع في هذه المرحلة؛ الإدارة تراجع الطلب أولًا ثم تتواصل معك عبر واتساب عند الحاجة.
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

            <div className="mt-6 rounded-3xl border border-[rgba(214,181,107,0.36)] bg-[linear-gradient(135deg,rgba(214,181,107,0.18),rgba(105,217,123,0.08),rgba(3,18,14,0.78))] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.26)]">
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="inline-flex rounded-full border border-[rgba(214,181,107,0.34)] bg-[rgba(214,181,107,0.12)] px-4 py-2 text-xs font-black text-[#f3dfac]">
                    مطلوب قبل إرسال الطلب
                  </div>

                  <h3 className="mt-3 text-2xl font-black text-white">
                    اختر لون الجهاز المطلوب
                  </h3>

                  <p className="mt-2 text-sm font-bold leading-7 text-[#d7ddd5]">
                    اختر اللون الأساسي، واكتب بدائل إذا عندك. توفر اللون يعتمد
                    على المخزون وقت الموافقة والتجهيز.
                  </p>
                </div>

                <div className="rounded-2xl border border-[rgba(105,217,123,0.24)] bg-[rgba(105,217,123,0.10)] px-4 py-3 text-center text-xs font-black text-[#b8f3c0]">
                  اختيار إجباري
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {deviceColorOptions.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    onClick={() => setSelectedDeviceColor(color.value)}
                    className={`rounded-2xl border p-4 text-right transition ${
                      selectedDeviceColor === color.value
                        ? "border-[#d6b56b] bg-[rgba(214,181,107,0.18)] shadow-[0_0_0_4px_rgba(214,181,107,0.08)]"
                        : "border-[rgba(214,181,107,0.16)] bg-[rgba(3,18,14,0.58)] hover:bg-[rgba(255,255,255,0.055)]"
                    }`}
                  >
                    <span className="block text-sm font-black text-white">
                      {color.label}
                    </span>

                    {color.hint && (
                      <span className="mt-1 block text-xs font-bold leading-5 text-[#aeb9af]">
                        {color.hint}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <textarea
                className={`${inputClass} mt-4 min-h-28 resize-none leading-7`}
                placeholder="اختياري: اكتب بدائل اللون. مثال: إذا البرتقالي غير متوفر بدي أزرق غامق، وإذا مش متوفر فضي."
                value={deviceColorNote}
                onChange={(e) => setDeviceColorNote(e.target.value)}
                maxLength={220}
              />

              <div className="mt-3 flex flex-col gap-2 text-xs font-bold text-[#aeb9af] sm:flex-row sm:items-center sm:justify-between">
                <span>
                  سنحاول توفير اللون المطلوب، وفي حال عدم توفره سيتم التواصل معك أو اعتماد البديل الأقرب حسب الملاحظة.
                </span>

                <span className="text-[#f3dfac]">
                  {deviceColorNote.length}/220
                </span>
              </div>
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
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-black text-[#f3dfac]">
                  طلب موافقة مبدئية — خطوة {currentStep} من {steps.length}
                </p>
                <h2 className="mt-2 text-2xl font-black text-white">
                  {steps[currentStep - 1]?.title}
                </h2>
              </div>

              <div className="rounded-2xl border border-[rgba(105,217,123,0.24)] bg-[rgba(105,217,123,0.08)] px-4 py-3 text-sm font-black text-[#b8f3c0]">
                يستغرق عادةً أقل من دقيقتين
              </div>
            </div>

            <div className="mb-6 h-3 overflow-hidden rounded-full bg-[rgba(214,181,107,0.14)]">
              <div
                className="h-full rounded-full bg-gradient-to-l from-[#d6b56b] via-[#69d97b] to-[#35c98e] transition-all duration-500"
                style={{ width: `${(currentStep / steps.length) * 100}%` }}
              />
            </div>

            <div className="grid gap-2 md:grid-cols-4">
              {steps.map((step) => (
                <button
                  key={step.number}
                  type="button"
                  onClick={() => {
                    if (step.number <= currentStep) {
                      setCurrentStep(step.number);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }
                  }}
                  className={`rounded-2xl border px-3 py-3 text-right text-xs font-black transition ${
                    currentStep === step.number
                      ? "border-[#d6b56b] bg-[rgba(214,181,107,0.16)] text-[#f3dfac]"
                      : step.number < currentStep
                      ? "border-[rgba(105,217,123,0.30)] bg-[rgba(105,217,123,0.10)] text-[#b8f3c0]"
                      : "border-[rgba(214,181,107,0.14)] bg-[rgba(255,255,255,0.035)] text-[#aeb9af]"
                  }`}
                >
                  <span className="ml-2">
                    {step.number < currentStep ? "✓" : step.number}
                  </span>
                  {step.title}
                </button>
              ))}
            </div>
          </section>

          {currentStep === 1 && (
            <section className="glass-panel gold-outline rounded-3xl p-5 shadow-2xl">
              <h2 className="mb-2 text-2xl font-bold">1. بيانات مقدم الطلب</h2>
              <p className="mb-5 text-sm font-bold leading-7 text-[#d7ddd5]">
                أدخل بياناتك الأساسية فقط. الإيميل اختياري، ورقم الهاتف هو الأهم للتواصل عبر واتساب.
              </p>

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
                  placeholder="البريد الإلكتروني — اختياري"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </section>
          )}

          {currentStep === 2 && (
            <>
              <section className="glass-panel gold-outline rounded-3xl p-5 shadow-2xl">
                <h2 className="mb-2 text-2xl font-bold">2. المحافظة والموقع</h2>
                <p className="mb-5 text-sm font-bold leading-7 text-[#d7ddd5]">
                  اختر المحافظة. تحديد الموقع عبر GPS اختياري، لكنه يساعد الإدارة على التجهيز والتواصل بشكل أسرع.
                </p>

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

                  <div className="rounded-3xl border border-[rgba(105,217,123,0.24)] bg-[rgba(105,217,123,0.08)] p-5">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-lg font-black text-[#b8f3c0]">
                          تحديد الموقع تلقائياً
                        </p>

                        <p className="mt-2 text-sm font-bold leading-7 text-[#d7ddd5]">
                          اختياري. يمكنك إكمال الطلب بدون GPS إذا لم ترغب بتفعيل الموقع.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={requestLocation}
                        disabled={isLocating}
                        className="green-button rounded-2xl px-5 py-3 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isLocating ? "جاري تحديد الموقع..." : "تحديد موقعي تلقائياً"}
                      </button>
                    </div>

                    {locationStatus && (
                      <div className="mt-4 rounded-2xl border border-[rgba(214,181,107,0.16)] bg-[rgba(3,18,14,0.50)] p-4 text-sm font-bold leading-7 text-[#d7ddd5]">
                        {locationStatus}
                        {locationLatitude && locationLongitude && (
                          <div className="mt-2 text-xs text-[#aeb9af]">
                            تم حفظ الإحداثيات بدقة تقريبية:{" "}
                            {locationAccuracy ? `${Math.round(locationAccuracy)} متر` : "غير محددة"}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <input
                    name="address-level2"
                    autoComplete="address-level2"
                    className={inputClass}
                    placeholder="المدينة / المنطقة — اختياري"
                    value={cityArea}
                    onChange={(e) => setCityArea(e.target.value)}
                  />

                  <input
                    name="street-address"
                    autoComplete="street-address"
                    className={inputClass}
                    placeholder="العنوان التفصيلي — اختياري"
                    value={detailedAddress}
                    onChange={(e) => setDetailedAddress(e.target.value)}
                  />

                  <input
                    name="address-line2"
                    autoComplete="address-line2"
                    className={inputClass}
                    placeholder="أقرب معلم واضح — اختياري"
                    value={nearestLandmark}
                    onChange={(e) => setNearestLandmark(e.target.value)}
                  />
                </div>
              </section>

              <section className="glass-panel gold-outline rounded-3xl p-5 shadow-2xl">
                <h2 className="mb-2 text-2xl font-bold">3. بيانات العمل والدخل</h2>
                <p className="mb-5 text-sm font-bold leading-7 text-[#d7ddd5]">
                  الراتب مطلوب لدراسة الطلب المبدئية، ومكان العمل اختياري في هذه المرحلة.
                </p>

                <div className="space-y-4">
                  <input
                    name="organization"
                    autoComplete="organization"
                    className={inputClass}
                    placeholder="مكان العمل — اختياري"
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
                          onChange={() => setApplicantSocialSecurity(true)}
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
                      التسجيل بالضمان الاجتماعي خيار يساعد في دراسة الطلب، لكنه غير إلزامي. الحد الأدنى للراتب الصافي هو 290 دينار أردني.
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}

          {currentStep === 3 && (
            <>
              {selectedProduct && selectedInstallment ? (
                <section className="glass-panel gold-outline rounded-3xl p-5 shadow-2xl">
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

                  <div className="mt-6 rounded-3xl border border-[rgba(214,181,107,0.36)] bg-[linear-gradient(135deg,rgba(214,181,107,0.18),rgba(105,217,123,0.08),rgba(3,18,14,0.78))] p-5">
                    <div className="mb-4">
                      <h3 className="text-2xl font-black text-white">
                        اختر لون الجهاز المطلوب
                      </h3>

                      <p className="mt-2 text-sm font-bold leading-7 text-[#d7ddd5]">
                        اختر اللون الأساسي، واكتب بدائل إذا عندك. توفر اللون يعتمد على المخزون وقت الموافقة والتجهيز.
                      </p>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {deviceColorOptions.map((color) => (
                        <button
                          key={color.value}
                          type="button"
                          onClick={() => setSelectedDeviceColor(color.value)}
                          className={`rounded-2xl border p-4 text-right transition ${
                            selectedDeviceColor === color.value
                              ? "border-[#d6b56b] bg-[rgba(214,181,107,0.18)] shadow-[0_0_0_4px_rgba(214,181,107,0.08)]"
                              : "border-[rgba(214,181,107,0.16)] bg-[rgba(3,18,14,0.58)] hover:bg-[rgba(255,255,255,0.055)]"
                          }`}
                        >
                          <span className="block text-sm font-black text-white">
                            {color.label}
                          </span>

                          {color.hint && (
                            <span className="mt-1 block text-xs font-bold leading-5 text-[#aeb9af]">
                              {color.hint}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>

                    <textarea
                      className={`${inputClass} mt-4 min-h-28 resize-none leading-7`}
                      placeholder="اختياري: اكتب بدائل اللون. مثال: إذا البرتقالي غير متوفر بدي أزرق غامق."
                      value={deviceColorNote}
                      onChange={(e) => setDeviceColorNote(e.target.value)}
                      maxLength={220}
                    />

                    <div className="mt-3 flex flex-col gap-2 text-xs font-bold text-[#aeb9af] sm:flex-row sm:items-center sm:justify-between">
                      <span>
                        سنحاول توفير اللون المطلوب، وفي حال عدم توفره سيتم التواصل معك أو اعتماد البديل الأقرب.
                      </span>

                      <span className="text-[#f3dfac]">
                        {deviceColorNote.length}/220
                      </span>
                    </div>
                  </div>
                </section>
              ) : (
                <section className="glass-panel gold-outline rounded-3xl p-5 shadow-2xl">
                  <h2 className="text-xl font-black">طلب عام بدون جهاز محدد</h2>

                  <p className="mt-2 text-sm leading-7 text-[#d7ddd5]">
                    لم يتم اختيار جهاز من صفحة المنتجات. يمكنك متابعة الطلب العام، أو الرجوع لاختيار جهاز محدد.
                  </p>

                  <Link
                    href="/products"
                    className="gold-button mt-4 inline-flex rounded-2xl px-5 py-3 text-sm font-black"
                  >
                    اختيار جهاز
                  </Link>
                </section>
              )}

              <section className="glass-panel gold-outline rounded-3xl p-5 shadow-2xl">
                <h2 className="mb-2 text-2xl font-bold">رفع هوية مقدم الطلب</h2>

                <p className="mb-5 text-sm leading-7 text-[#d7ddd5]">
                  الهوية مطلوبة للجدية وحماية الطرفين من الطلبات الوهمية. ارفع الوجه الأمامي والخلفي فقط.
                </p>

                <div className="mb-5 grid gap-3 md:grid-cols-3">
                  <TrustCard
                    title="فلترة الطلبات الوهمية"
                    text="نطلب الهوية لأن الطلبات الجدية فقط تُراجع."
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
                            يمكنك اختيار صورة محفوظة من الجهاز أو تصوير الهوية.
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
            </>
          )}

          {currentStep === 4 && (
            <>
              <section className="glass-panel gold-outline rounded-3xl p-5 shadow-2xl">
                <h2 className="mb-4 text-2xl font-bold">4. المراجعة والإقرار النهائي</h2>

                <div className="mb-5 grid gap-3 md:grid-cols-2">
                  <InfoBox label="الاسم" value={fullName || "—"} />
                  <InfoBox label="الهاتف" value={phone || "—"} />
                  <InfoBox label="المحافظة" value={governorate || "—"} />
                  <InfoBox label="الراتب" value={salary ? `${salary} د.أ` : "—"} />
                </div>

                <label className="flex items-center gap-3 rounded-2xl border border-[rgba(214,181,107,0.16)] bg-[rgba(3,18,14,0.74)] p-4">
                  <input
                    type="checkbox"
                    checked={financialClear}
                    onChange={(e) => setFinancialClear(e.target.checked)}
                  />

                  <span>أتعهد بعدم وجود قضايا مالية عليّ</span>
                </label>

                <div className="mt-4 rounded-2xl border border-[rgba(214,181,107,0.18)] bg-[rgba(255,255,255,0.035)] p-5 text-sm leading-8 text-[#d7ddd5]">
                  <strong className="text-[#f3dfac]">ملاحظة:</strong> هذا الطلب مبدئي لغرض مراجعة البيانات فقط، ولا يعني الموافقة النهائية على التقسيط. سيتم التواصل معك عبر واتساب لاستكمال أي خطوة إضافية عند الحاجة.
                </div>
              </section>

              <section className="glass-panel gold-outline rounded-3xl p-5 shadow-2xl">
                <div className="rounded-2xl border border-[rgba(214,181,107,0.28)] bg-[rgba(214,181,107,0.08)] p-5">
                  <h2 className="text-2xl font-black text-[#f3dfac]">
                    الشروط المختصرة
                  </h2>

                  <p className="mt-3 text-sm font-bold leading-7 text-[#d7ddd5]">
                    الشروط ظاهرة هنا في آخر خطوة حتى تكون واضحة قبل الإرسال.
                  </p>
                </div>

                <div className="mt-4 max-h-96 overflow-y-auto rounded-2xl border border-[rgba(214,181,107,0.16)] bg-[rgba(2,18,14,0.92)] p-5 text-sm leading-8 text-[#d7ddd5]">
                  <ul className="list-disc space-y-2 pr-5">
                    <li>الحد الأدنى للراتب الصافي لقبول دراسة الطلب هو 290 دينار أردني.</li>
                    <li>لا يشترط أن يكون مقدم الطلب مسجلًا في الضمان الاجتماعي.</li>
                    <li>خيار الضمان الاجتماعي موجود كمعلومة إضافية تساعد في دراسة الطلب، لكنه غير إلزامي.</li>
                    <li>لا يسمح بوجود أكثر من طلب فعّال لنفس مقدم الطلب.</li>
                    <li>يجب تقديم هوية شخصية سارية لمقدم الطلب، وجه أمامي وخلفي.</li>
                    <li>صور الهويات والوثائق تستخدم فقط لدراسة طلب التمويل والتحقق من البيانات.</li>
                    <li>البيانات الخاطئة أو الناقصة تؤدي لرفض الطلب.</li>
                    <li>تقديم الطلب لا يعني الموافقة النهائية على طلب التقسيط.</li>
                    <li>الموافقة النهائية تتم بعد مراجعة الإدارة وتوقيع العقد في مكاتبنا.</li>
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
                    أقرّ بأنني قرأت الشروط والأحكام بعناية وأوافق عليها، وأوافق على استخدام بياناتي والوثائق المرفوعة لغرض دراسة طلب التمويل فقط.
                  </span>
                </label>
              </section>

              <section className="glass-panel gold-outline rounded-3xl p-5 shadow-2xl">
                <h2 className="mb-4 text-2xl font-bold">معلومات الشركة والتسجيل</h2>

                <div className="rounded-2xl border border-[rgba(214,181,107,0.18)] bg-[rgba(255,255,255,0.035)] p-5 text-sm font-bold leading-8 text-[#d7ddd5]">
                  <p>{legalRegistrationText}</p>
                  <p className="mt-3">
                    يتم استخدام البيانات والوثائق المرفوعة فقط لغرض مراجعة طلب التمويل والتحقق من البيانات، ولا يتم استخدامها لأي غرض تسويقي أو عرض عام.
                  </p>
                </div>
              </section>
            </>
          )}

          <div className="sticky bottom-4 z-30 grid gap-3 rounded-3xl border border-[rgba(214,181,107,0.18)] bg-[#03120e]/90 p-3 shadow-2xl backdrop-blur-xl sm:grid-cols-2">
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={goToPreviousStep}
                className="soft-button rounded-2xl p-4 text-base font-black transition"
                disabled={isSubmitting}
              >
                السابق
              </button>
            ) : (
              <Link
                href="/products"
                className="soft-button rounded-2xl p-4 text-center text-base font-black transition"
              >
                تغيير الجهاز
              </Link>
            )}

            {currentStep < steps.length ? (
              <button
                type="button"
                onClick={goToNextStep}
                className="green-button rounded-2xl p-4 text-base font-black shadow-2xl transition"
              >
                التالي
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting}
                className="green-button rounded-2xl p-4 text-base font-black shadow-2xl disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "جاري تقديم الطلب..." : "إرسال الطلب الآن"}
              </button>
            )}
          </div>
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
    { label: "تنبيه الإدارة", active: safeProgress >= 84, done: safeProgress >= 100 },
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
