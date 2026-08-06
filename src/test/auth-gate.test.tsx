import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { User } from "@supabase/supabase-js";

const navigate = vi.fn();
const authState = { user: null as User | null, loading: false };

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  Link: ({ children }: { children?: React.ReactNode }) => <a href="/">{children}</a>,
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => authState,
}));

vi.mock("@/components/site", () => ({
  Aurora: () => null,
  NavBar: () => null,
  SiteFooter: () => null,
}));

const clearTravelSessionState = vi.fn();
vi.mock("@/lib/session-state", () => ({
  clearTravelSessionState: (...args: unknown[]) => clearTravelSessionState(...args),
}));

const { RequireAuth } = await import("@/components/require-auth");

describe("root auth gate", () => {
  beforeEach(() => {
    navigate.mockClear();
    clearTravelSessionState.mockClear();
    authState.user = null;
    authState.loading = false;
  });

  it("redirects a signed-out visitor to /auth instead of showing the planner", async () => {
    render(
      <RequireAuth>
        <form aria-label="travel form" />
      </RequireAuth>,
    );
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/auth", replace: true }));
    expect(screen.queryByLabelText("travel form")).not.toBeInTheDocument();
    expect(clearTravelSessionState).toHaveBeenCalled();
  });

  it("waits while the session is still being checked", async () => {
    authState.loading = true;
    render(
      <RequireAuth>
        <form aria-label="travel form" />
      </RequireAuth>,
    );
    expect(screen.getByText(/checking your session/i)).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("renders the planner for a signed-in user", async () => {
    authState.user = { id: "u1" } as User;
    render(
      <RequireAuth>
        <form aria-label="travel form" />
      </RequireAuth>,
    );
    expect(screen.getByLabelText("travel form")).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });
});
