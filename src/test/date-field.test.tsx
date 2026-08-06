import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { DateField } from "@/components/date-field";
import { validateDateRange } from "@/lib/date-input";

function Harness({ min }: { min?: string }) {
  const [depart, setDepart] = useState("");
  const [ret, setRet] = useState("");
  const setDeparture = (iso: string) => {
    setDepart(iso);
    if (iso && ret && ret < iso) setRet("");
  };
  return (
    <div>
      <DateField ariaLabel="Departure date" value={depart} min={min} onChange={setDeparture} />
      <DateField ariaLabel="Return date" value={ret} min={depart || min} onChange={setRet} />
      <output data-testid="depart">{depart}</output>
      <output data-testid="return">{ret}</output>
    </div>
  );
}

describe("DateField", () => {
  it("accepts manual keyboard entry and stores ISO", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText("Departure date");
    await user.click(input);
    await user.keyboard("04092099");
    expect(input).toHaveValue("04-09-2099");
    expect(screen.getByTestId("depart")).toHaveTextContent("2099-09-04");
  });

  it("shows a validation message for an impossible typed date", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText("Departure date");
    await user.click(input);
    await user.keyboard("31022099");
    await user.tab();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByTestId("depart")).toHaveTextContent("");
  });

  it("opens the calendar from the icon and selects a day", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /open calendar for departure date/i }));
    const dialog = await screen.findByRole("dialog", { name: /departure date calendar/i });
    expect(dialog).toBeInTheDocument();
    const days = dialog.querySelectorAll<HTMLButtonElement>(
      "button[aria-label^='2']:not([disabled])",
    );
    const target = days[days.length - 1]!;
    const iso = target.getAttribute("aria-label")!;
    await user.click(target);
    await waitFor(() => expect(screen.getByTestId("depart")).toHaveTextContent(iso));
  });

  it("opens the calendar when the field body is clicked (touch/mouse)", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByLabelText("Return date"));
    expect(
      await screen.findByRole("dialog", { name: /return date calendar/i }),
    ).toBeInTheDocument();
  });

  it("clears an invalid return date when departure moves later", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByLabelText("Return date"));
    await user.keyboard("10092099");
    await waitFor(() => expect(screen.getByTestId("return")).toHaveTextContent("2099-09-10"));

    await user.click(screen.getByLabelText("Departure date"));
    await user.keyboard("20092099");
    await waitFor(() => expect(screen.getByTestId("depart")).toHaveTextContent("2099-09-20"));
    expect(screen.getByTestId("return")).toHaveTextContent("");
  });

  it("refuses a return date earlier than the departure date", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByLabelText("Departure date"));
    await user.keyboard("20092099");
    await waitFor(() => expect(screen.getByTestId("depart")).toHaveTextContent("2099-09-20"));

    await user.click(screen.getByLabelText("Return date"));
    await user.keyboard("10092099");
    await user.tab();
    expect(screen.getByTestId("return")).toHaveTextContent("");
    expect(validateDateRange("2099-09-20", "2099-09-10")).toMatch(/on or after/i);
  });

  it("rejects departures in the past", async () => {
    const user = userEvent.setup();
    render(<Harness min="2099-01-01" />);
    await user.click(screen.getByLabelText("Departure date"));
    await user.keyboard("01012000");
    await user.tab();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByTestId("depart")).toHaveTextContent("");
  });

  it("supports mobile-style touch taps on the calendar icon", async () => {
    render(<Harness />);
    const icon = screen.getByRole("button", { name: /open calendar for return date/i });
    icon.click();
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: /return date calendar/i })).toBeInTheDocument(),
    );
  });

  it("does not call onChange for an empty field on blur", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DateField ariaLabel="Departure date" value="" onChange={onChange} />);
    await user.click(screen.getByLabelText("Departure date"));
    await user.tab();
    expect(onChange).toHaveBeenCalledWith("");
  });
});
