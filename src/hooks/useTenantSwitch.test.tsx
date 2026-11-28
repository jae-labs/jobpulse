import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useJobsPageQuery, useSaveProfileMutation } from "./useQueries";
import { queryKeys } from "../lib/queryKeys";
import { DEFAULT_PROFILE } from "../lib/defaultProfile";
import { getCurrentUserId } from "../lib/userSession";
import { saveUserProfile } from "../lib/userProfile";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("../lib/supabase", () => ({ supabase: { rpc } }));
vi.mock("../lib/userSession", () => ({ getCurrentUserId: vi.fn() }));
vi.mock("../lib/userProfile", () => ({ saveUserProfile: vi.fn() }));

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}
describe("tenant switch boundaries", () => {
  beforeEach(() => vi.clearAllMocks());
  it("never uses the previous account as placeholder data", async () => {
    const { client, wrapper } = setup();
    client.setQueryData(queryKeys.jobsSearchPage("owner-a", {}), {
      total: 1,
      items: [{ id: 1, matched_skills: ["private-owner-a"] }],
    });
    vi.mocked(getCurrentUserId).mockResolvedValue("owner-b");
    rpc.mockReturnValue({ abortSignal: () => new Promise(() => {}) });
    const { result, rerender, unmount } = renderHook(
      ({ owner }) => useJobsPageQuery(owner),
      { wrapper, initialProps: { owner: "owner-a" } },
    );
    expect(result.current.data?.items[0].matched_skills).toEqual([
      "private-owner-a",
    ]);
    rerender({ owner: "owner-b" });
    expect(result.current.data).toBeUndefined();
    expect(result.current.isPending).toBe(true);
    unmount();
    client.clear();
  });
  it("rejects a response when authentication changed during the request", async () => {
    const { client, wrapper } = setup();
    vi.mocked(getCurrentUserId)
      .mockResolvedValueOnce("owner-a")
      .mockResolvedValue("owner-b");
    rpc.mockReturnValue({
      abortSignal: async () => ({ data: { total: 0, items: [] }, error: null }),
    });
    const { result, unmount } = renderHook(() => useJobsPageQuery("owner-a"), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("Active account changed");
    expect(
      client.getQueryData(queryKeys.jobsSearchPage("owner-a", {})),
    ).toBeUndefined();
    unmount();
    client.clear();
  });
  it("does not save an old account form into the newly active account", async () => {
    const { client, wrapper } = setup();
    vi.mocked(getCurrentUserId).mockResolvedValue("owner-b");
    const { result, unmount } = renderHook(
      () => useSaveProfileMutation("owner-a"),
      { wrapper },
    );
    await act(async () => {
      await expect(result.current.mutateAsync(DEFAULT_PROFILE)).rejects.toThrow(
        "Active account changed",
      );
    });
    expect(saveUserProfile).not.toHaveBeenCalled();
    unmount();
    client.clear();
  });
});
