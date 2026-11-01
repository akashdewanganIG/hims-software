"use client";

import * as React from "react";
import QRCode from "qrcode";

export function createDocumentQrDataUrl(value: string) {
  return QRCode.toDataURL(value, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 160,
    color: { dark: "#111827", light: "#ffffff" },
  });
}

export function DocumentQr({
  value,
  image: suppliedImage,
}: {
  value: string;
  image?: string;
}) {
  const [generatedImage, setGeneratedImage] = React.useState<string>();

  React.useEffect(() => {
    if (suppliedImage) return;
    let cancelled = false;
    void createDocumentQrDataUrl(value).then(
      url => !cancelled && setGeneratedImage(url)
    );
    return () => {
      cancelled = true;
    };
  }, [suppliedImage, value]);

  const image = suppliedImage ?? generatedImage;
  if (!image) return null;
  return (
    <div className="shrink-0 text-center text-[9px] leading-tight text-neutral-500">
      {/* eslint-disable-next-line @next/next/no-img-element -- generated QR data URL */}
      <img
        src={image}
        alt="QR code to view this document online"
        className="size-16"
      />
      <span>View online</span>
    </div>
  );
}
