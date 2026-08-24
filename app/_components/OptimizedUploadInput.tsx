"use client";

import { useState } from "react";
import {
  formatUploadBytes,
  optimizeDocumentImage,
} from "@/lib/clientImageOptimization";

type OptimizedUploadInputProps = {
  name: string;
  accept: string;
  required?: boolean;
  className?: string;
};

function setFormOptimizationBusy(
  input: HTMLInputElement,
  busy: boolean
) {
  const form = input.form;

  if (!form) return;

  const current = Number(form.dataset.imageOptimizationBusy || "0");
  const next = Math.max(0, current + (busy ? 1 : -1));
  form.dataset.imageOptimizationBusy = String(next);

  const submitters = form.querySelectorAll<
    HTMLButtonElement | HTMLInputElement
  >('button[type="submit"], input[type="submit"]');

  submitters.forEach((submitter) => {
    if (busy && current === 0) {
      submitter.dataset.imageOptimizationWasDisabled = submitter.disabled
        ? "1"
        : "0";
      submitter.disabled = true;
    }

    if (!busy && next === 0) {
      submitter.disabled =
        submitter.dataset.imageOptimizationWasDisabled === "1";
      delete submitter.dataset.imageOptimizationWasDisabled;
    }
  });
}

export default function OptimizedUploadInput({
  name,
  accept,
  required = false,
  className = "",
}: OptimizedUploadInputProps) {
  const [status, setStatus] = useState("");

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const original = input.files?.[0];

    if (!original) {
      setStatus("");
      return;
    }

    if (
      original.type === "application/pdf" ||
      !original.type.startsWith("image/")
    ) {
      setStatus(`الملف جاهز للرفع — ${formatUploadBytes(original.size)}`);
      return;
    }

    setFormOptimizationBusy(input, true);
    setStatus("جاري تجهيز الصورة وتقليل حجمها مع الحفاظ على وضوحها...");

    try {
      const result = await optimizeDocumentImage(original);

      if (result.file !== original) {
        try {
          const transfer = new DataTransfer();
          transfer.items.add(result.file);
          input.files = transfer.files;
        } catch (error) {
          console.warn(
            "Browser cannot replace the selected file; original will be submitted.",
            error
          );
          setStatus(
            `الصورة جاهزة للرفع بالحجم الأصلي — ${formatUploadBytes(
              original.size
            )}`
          );
          return;
        }
      }

      if (result.optimized) {
        setStatus(
          `تم تحسين الصورة: ${formatUploadBytes(
            result.originalBytes
          )} ← ${formatUploadBytes(result.optimizedBytes)}`
        );
      } else {
        setStatus(
          `الصورة جاهزة للرفع — ${formatUploadBytes(result.optimizedBytes)}`
        );
      }
    } finally {
      setFormOptimizationBusy(input, false);
    }
  }

  return (
    <div>
      <input
        required={required}
        type="file"
        name={name}
        accept={accept}
        onChange={handleChange}
        className={className}
      />

      {status && (
        <p
          role="status"
          aria-live="polite"
          className="mt-2 text-xs font-bold leading-6 text-[#6b745f]"
        >
          {status}
        </p>
      )}
    </div>
  );
}
