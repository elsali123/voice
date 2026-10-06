"use client";

import { useEffect, useState } from "react";

/** Loudness of an audio buffer on a 0–1 scale (normal speech is roughly 0.2–0.8). */
export function levelOf(analyser: AnalyserNode, data: Float32Array<ArrayBuffer>): number {
  analyser.getFloatTimeDomainData(data);
  let sum = 0;
  for (const v of data) sum += v * v;
  return Math.min(1, Math.sqrt(sum / data.length) * 6);
}

/** Live microphone level, plus the loudest level so far, for the "we can hear you" check. */
export function useMicLevel(stream: MediaStream | null): { level: number; peak: number } {
  const [level, setLevel] = useState(0);
  const [peak, setPeak] = useState(0);
  useEffect(() => {
    if (!stream || !stream.getAudioTracks().length) return;
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Float32Array(analyser.fftSize);
    // Browsers keep audio paused until the person has clicked something on the page.
    const resume = () => void ctx.resume();
    resume();
    window.addEventListener("pointerdown", resume);
    const timer = setInterval(() => {
      const l = levelOf(analyser, data);
      setLevel(l);
      setPeak((p) => Math.max(p, l));
    }, 100);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pointerdown", resume);
      void ctx.close();
    };
  }, [stream]);
  return { level, peak };
}
