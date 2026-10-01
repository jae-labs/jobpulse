import { pipeline, env } from "@huggingface/transformers";
env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = "/models/";
const wasm = env.backends.onnx.wasm;
if (!wasm) throw new Error("WASM backend unavailable");
wasm.wasmPaths = {
  mjs: "/wasm/ort-wasm-simd-threaded.mjs",
  wasm: "/wasm/ort-wasm-simd-threaded.wasm",
};
wasm.numThreads = 1;
env.useWasmCache = false;
wasm.proxy = false;
self.onmessage = async (event: MessageEvent<string>) => {
  try {
    const extractor = await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2",
      { dtype: "q8", device: "wasm" },
    );
    const output = await extractor(event.data, {
      pooling: "mean",
      normalize: true,
    });
    self.postMessage(Array.from(output.data));
  } catch {
    self.postMessage(null);
  }
};
