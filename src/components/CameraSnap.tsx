"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconCamera } from "./icons";

/** Takes a square profile picture with the webcam. */
export default function CameraSnap({ onPhoto }: { onPhoto: (dataUrl: string | null) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [problem, setProblem] = useState(false);

  const [attempt, setAttempt] = useState(0);
  const open = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 } }, audio: false }).then(
      (s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        setProblem(false);
        setStream(s);
      },
      () => !cancelled && setProblem(true),
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, [stream]);

  const snap = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const side = Math.min(video.videoWidth, video.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 480;
    const ctx = canvas.getContext("2d")!;
    // Mirror it, so the picture looks the way the person saw themselves.
    ctx.translate(480, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side, 0, 0, 480, 480);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setPhoto(dataUrl);
    onPhoto(dataUrl);
  };

  const retake = () => {
    setPhoto(null);
    onPhoto(null);
  };

  if (problem) {
    return (
      <div className="rounded-3xl border-2 border-warn-line bg-warn-soft p-6 text-xl">
        <p className="font-bold">We can&apos;t use the camera right now.</p>
        <p className="mt-2">Look for a camera symbol at the top of the browser window, choose &ldquo;Allow&rdquo;, then try again.</p>
        <button type="button" onClick={open} className="mt-4 rounded-2xl bg-brand px-6 py-3 font-bold text-white">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative size-72 overflow-hidden rounded-full border-4 border-line bg-ink/10 sm:size-80">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL preview
          <img src={photo} alt="Your new picture" className="h-full w-full object-cover" />
        ) : (
          <video ref={videoRef} autoPlay muted playsInline className="h-full w-full -scale-x-100 object-cover" />
        )}
      </div>
      {photo ? (
        <button type="button" onClick={retake} className="rounded-2xl border-2 border-line bg-card px-6 py-3 text-xl font-bold hover:border-brand">
          Take another picture
        </button>
      ) : (
        <button
          type="button"
          onClick={snap}
          disabled={!stream}
          className="flex items-center gap-3 rounded-2xl bg-brand px-8 py-4 text-2xl font-bold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          <IconCamera className="size-8" /> Take my picture
        </button>
      )}
    </div>
  );
}
