import type { Profile } from "../types/job";

export const PROFILE_EMBEDDING_MODEL_VERSION = "all-MiniLM-L6-v2:384:v1";
export function profileDocument(profile: Profile): string {
  const parts = [
    profile.headline,
    profile.current_role,
    profile.summary,
    (profile.keywords ?? []).join(" "),
    (profile.tools_software ?? []).join(" "),
    (profile.languages ?? []).join(" "),
    profile.certifications,
    profile.education,
  ];
  return (
    parts.filter(Boolean).join(" ").trim() || "Professional career experience"
  );
}

export async function profileContentHash(profile: Profile): Promise<string> {
  const document = profileDocument(profile);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(document),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

let inferenceQueue: Promise<unknown> = Promise.resolve();
export function embedProfile(profile: Profile): Promise<number[]> {
  const document = profileDocument(profile);
  const result = inferenceQueue
    .catch(() => {})
    .then(
      () =>
        new Promise<number[]>((resolve, reject) => {
          const worker = new Worker(
            new URL("./profileEmbedding.worker.ts", import.meta.url),
            { type: "module" },
          );
          const timeout = window.setTimeout(() => {
            worker.terminate();
            reject(new Error("Profile inference timed out"));
          }, 120_000);
          const finish = () => {
            window.clearTimeout(timeout);
            worker.terminate();
          };
          worker.onerror = () => {
            finish();
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
