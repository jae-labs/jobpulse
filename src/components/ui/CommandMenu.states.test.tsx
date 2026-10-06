import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CommandMenu } from "./CommandMenu";
const query = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/useQueries", () => ({ useJobsPageQuery: query }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
const props = {
  isOpen: true,
  onOpenChange: vi.fn(),
  onSelectJob: vi.fn(),
  userId: "synthetic-owner",
};
describe("command search states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
  });
  it("shows loading separately from an empty result", () => {
    query.mockReturnValue({ isPending: true, data: undefined });
    render(<CommandMenu {...props} />);
    expect(screen.getByRole("status")).toHaveTextContent("common.loading");
    expect(screen.queryByText("command.noResults")).toBeNull();
  });
  it("reports and retries a failed request without showing stale results", () => {
    const refetch = vi.fn();
    query.mockReturnValue({
      isError: true,
      refetch,
      data: { items: [{ id: 1, title: "Stale private result" }] },
    });
    render(<CommandMenu {...props} />);
    expect(screen.getByRole("alert")).toHaveTextContent("common.loadError");
    expect(screen.queryByText("Stale private result")).toBeNull();
    fireEvent.click(screen.getByText("common.retry"));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("does not render query results without an authenticated account", () => {
    query.mockReturnValue({ data: { items: [{ id: 1, title: "Previous account result" }] } });
    render(<CommandMenu {...props} userId={null} />);
    expect(screen.queryByText("Previous account result")).toBeNull();
    expect(query).toHaveBeenCalledWith(null, { search: "", limit: 25 }, false);
  });
  it("retains authoritative server matches and bounds the search input", async () => {
    query.mockReturnValue({
      data: {
        items: [
          {
            id: 1,
            title: "Server-ranked result",
            company: "Synthetic company",
            status: "new",
            relevance: 75,
            matched_skills: [],
          },
        ],
      },
    });
    render(<CommandMenu {...props} />);
    const input = screen.getByPlaceholderText("command.placeholder");
    fireEvent.change(input, { target: { value: "x".repeat(100) } });
    expect(input).toHaveValue("x".repeat(80));
    await waitFor(() =>
      expect(screen.getByText("Server-ranked result")).toBeVisible(),
    );
    expect(query).toHaveBeenLastCalledWith(
      "synthetic-owner",
      { search: "x".repeat(80), limit: 25 },
      true,
    );
  });
});
