import { pipeline, env } from "@huggingface/transformers";
import { poolEmbeddingVectors, tokenWindows } from './embeddingWindows';
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
let extractorPromise: ReturnType<typeof pipeline<'feature-extraction'>> | undefined;
self.onmessage = async (event: MessageEvent<string>) => {
  try {
    const extractor = await (extractorPromise ??= pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2",
      { dtype: "q8", device: "wasm" },
    ));
    const tokens = extractor.tokenizer.encode(event.data, { add_special_tokens: false });
    const vectors: number[][] = [];
    for (const window of tokenWindows(tokens)) {
      const document = extractor.tokenizer.decode(window, { skip_special_tokens: true });
      const output = await extractor(document, { pooling: 'mean', normalize: true });
      vectors.push(Array.from(output.data, Number));
    }
    self.postMessage(poolEmbeddingVectors(vectors));
  } catch {
    self.postMessage(null);
  }
};
