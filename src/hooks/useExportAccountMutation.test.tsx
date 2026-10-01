import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useExportAccountMutation } from "./useQueries";
import { getCurrentUserId } from "../lib/userSession";

const from = vi.hoisted(() => vi.fn());
vi.mock("../lib/supabase", () => ({ supabase: { from } }));
vi.mock("../lib/userSession", () => ({ getCurrentUserId: vi.fn() }));

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { mutations: { retry: false } } })
      }
    >
      {children}
    </QueryClientProvider>
  );
}

describe("account export isolation", () => {
  beforeEach(() => vi.clearAllMocks());
  it("does not download an export after the active account changes", async () => {
    const filters: Array<[string, string]> = [];
    from.mockImplementation(() => ({
      select: () => ({
        eq: (column: string, owner: string) => {
          filters.push([column, owner]);
          return {
            order: () => ({ range: async () => ({ data: [], error: null }) }),
          };
        },
      }),
    }));
    vi.mocked(getCurrentUserId)
      .mockResolvedValueOnce("owner-a")
      .mockResolvedValueOnce("owner-b");
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const { result } = renderHook(useExportAccountMutation, { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toThrow(
        "Account changed during export",
      );
    });
    expect(filters).toHaveLength(6);
    expect(filters.at(-1)).toEqual(["invited_by", "owner-a"]);
    expect(
      filters
        .slice(0, 5)
        .every(
          ([column, owner]) => column === "user_id" && owner === "owner-a",
        ),
    ).toBe(true);
    expect(click).not.toHaveBeenCalled();
    click.mockRestore();
  });
  it("fails closed when a private table cannot be exported", async () => {
    from.mockReturnValue({
      select: () => ({
        eq: () => ({
          order: () => ({
            range: async () => ({
              data: null,
              error: { message: "private error" },
            }),
          }),
        }),
      }),
    });
    vi.mocked(getCurrentUserId).mockResolvedValue("owner-a");
    const { result } = renderHook(useExportAccountMutation, { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toThrow(
        "Account export failed",
      );
    });
    expect(from).toHaveBeenCalledTimes(1);
  });
});
