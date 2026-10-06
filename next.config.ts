import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Kokoro (the free, on-device interviewer voice) uses native ONNX bindings,
  // so it must be loaded with Node's own require instead of being bundled.
  serverExternalPackages: ["kokoro-js", "@huggingface/transformers", "onnxruntime-node"],
};

export default nextConfig;
