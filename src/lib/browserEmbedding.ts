import type { Profile } from "../types/job";
import { PROFILE_PREPROCESSING_VERSION } from './embeddingWindows';

export const PROFILE_EMBEDDING_MODEL_VERSION = "all-MiniLM-L6-v2:384:v1";
export function profileDocument(profile: Profile): string {
  const parts = [
    profile.headline,
    profile.current_role,
    (profile.keywords ?? []).join(" "),
    (profile.tools_software ?? []).join(" "),
    (profile.languages ?? []).join(" "),
    profile.certifications,
    profile.education,
    profile.summary,
  ];
  return (
    parts.filter(Boolean).join(" ").trim() || "Professional career experience"
  );
}

export async function profileContentHash(profile: Profile): Promise<string> {
  const document = profileDocument(profile);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${PROFILE_PREPROCESSING_VERSION}\n${document}`),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

let inferenceQueue: Promise<unknown> = Promise.resolve();
let cachedWorker: Worker | null = null;
let idleTimeout: ReturnType<typeof setTimeout> | undefined;
let cancelInference: (() => void) | null = null;

export function disposeProfileEmbeddingWorker(): void {
  clearTimeout(idleTimeout);
  cachedWorker?.terminate();
  cachedWorker = null;
  cancelInference?.();
  cancelInference = null;
}

export function embedProfile(profile: Profile): Promise<number[]> {
  const document = profileDocument(profile);
  const result = inferenceQueue
    .catch(() => {})
    .then(
      () =>
        new Promise<number[]>((resolve, reject) => {
          clearTimeout(idleTimeout);
          const worker = cachedWorker ??= new Worker(
            new URL("./profileEmbedding.worker.ts", import.meta.url),
            { type: "module" },
          );
          const timeout = window.setTimeout(() => {
            disposeProfileEmbeddingWorker();
          }, 120_000);
          cancelInference = () => {
            window.clearTimeout(timeout);
            reject(new Error('Profile inference interrupted'));
          };
          const finish = () => {
            window.clearTimeout(timeout);
            cancelInference = null;
            worker.onmessage = null;
            worker.onerror = null;
            idleTimeout = setTimeout(disposeProfileEmbeddingWorker, 60_000);
          };
          worker.onerror = () => {
            finish();
            disposeProfileEmbeddingWorker();
            reject(new Error("Profile inference failed"));
          };
          worker.onmessage = (event: MessageEvent<unknown>) => {
            finish();
            const embedding = event.data;
            if (
              !Array.isArray(embedding) ||
              embedding.length !== 384 ||
              embedding.some(
                (value) => typeof value !== "number" || !Number.isFinite(value),
              )
            ) {
              reject(new Error("Profile embedding has invalid dimensions"));
              return;
            }
            resolve(embedding as number[]);
          };
          worker.postMessage(document);
        }),
    );
  inferenceQueue = result;
  return result;
}
