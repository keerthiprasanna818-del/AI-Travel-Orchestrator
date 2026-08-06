/**
 * Reusable, plan-agnostic PDF exporter. Everything is rendered from the
 * `plan_result` of the currently opened travel plan — no hardcoded trip data,
 * no print dialog. Works for every current and future plan.
 */
import type { PlanResult } from "@/lib/plan-schema";

/** Brand colours, used subtly (headers, rules, labels). */
const BRAND = { r: 109, g: 76, b: 232 };
const ACCENT = { r: 28, g: 166, b: 176 };
const INK = { r: 24, g: 24, b: 32 };
const MUTED = { r: 108, g: 112, b: 128 };

const PAGE_W = 210;
const PAGE_H = 297;
const M = 16;
const CONTENT_W = PAGE_W - M * 2;

export function inr(value: number | null | undefined) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `Rs. ${Math.round(n).toLocaleString("en-IN")}`;
}

function niceDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function slug(value: string) {
  return (value || "trip")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 48) || "trip";
}

export function pdfFileName(plan: PlanResult) {
  const dest = slug(plan.summary?.destination ?? "trip");
  const date = (plan.summary?.departureDate ?? "").slice(0, 10) || "plan";
  return `AI-Travel-Plan-${dest}-${date}.pdf`;
}

type Doc = import("jspdf").jsPDF;

/** Cursor-based writer that never splits a block across a page boundary. */
class Writer {
  y = M + 18;
  constructor(readonly doc: Doc) {}

  /** Reserve vertical space; starts a new page when the block would be cut. */
  need(height: number) {
    if (this.y + height <= PAGE_H - M - 10) return;
    this.doc.addPage();
    this.y = M + 6;
  }

  gap(h = 4) {
    this.y += h;
  }

  /** `reserve` keeps the heading with the first chunk of its section. */
  heading(text: string, reserve = 34) {
    this.need(reserve);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(13);
    this.doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
    this.doc.text(text, M, this.y);
    this.y += 2.5;
    this.doc.setDrawColor(BRAND.r, BRAND.g, BRAND.b);
    this.doc.setLineWidth(0.4);
    this.doc.line(M, this.y, M + CONTENT_W, this.y);
    this.y += 6;
  }

  subheading(text: string) {
    const lines = this.doc.splitTextToSize(text, CONTENT_W);
    this.need(6 * lines.length + 2);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(10.5);
    this.doc.setTextColor(INK.r, INK.g, INK.b);
    this.doc.text(lines, M, this.y);
    this.y += 5 * lines.length + 1;
  }

  body(text: string, options?: { muted?: boolean; indent?: number }) {
    const value = (text ?? "").toString().trim();
    if (!value) return;
    const indent = options?.indent ?? 0;
    const lines = this.doc.splitTextToSize(value, CONTENT_W - indent);
    this.need(4.8 * lines.length + 2);
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(9.5);
    const c = options?.muted ? MUTED : INK;
    this.doc.setTextColor(c.r, c.g, c.b);
    this.doc.text(lines, M + indent, this.y);
    this.y += 4.8 * lines.length + 1.5;
  }

  bullets(items: string[]) {
    items.filter(Boolean).forEach((item) => {
      const lines = this.doc.splitTextToSize(item, CONTENT_W - 6);
      this.need(4.8 * lines.length + 2);
      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(9.5);
      this.doc.setTextColor(ACCENT.r, ACCENT.g, ACCENT.b);
      this.doc.text("•", M + 1, this.y);
      this.doc.setTextColor(INK.r, INK.g, INK.b);
      this.doc.text(lines, M + 6, this.y);
      this.y += 4.8 * lines.length + 1.5;
    });
  }

  /** Two-column key/value grid — kept whole on one page. */
  keyValues(rows: [string, string][]) {
    const colW = CONTENT_W / 2;
    const rowH = 11;
    const height = Math.ceil(rows.length / 2) * rowH;
    this.need(height + 2);
    rows.forEach(([label, value], i) => {
      const x = M + (i % 2) * colW;
      const y = this.y + Math.floor(i / 2) * rowH;
      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(7.5);
      this.doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
      this.doc.text(label.toUpperCase(), x, y);
      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(9.5);
      this.doc.setTextColor(INK.r, INK.g, INK.b);
      this.doc.text(this.doc.splitTextToSize(value || "—", colW - 6).slice(0, 1), x, y + 4.6);
    });
    this.y += height + 3;
  }

  /** Simple table; each row stays intact, header repeats after a break. */
  table(headers: string[], rows: string[][], widths: number[]) {
    const rowHeight = (row: string[]) =>
      Math.max(...row.map((cell, i) => this.doc.splitTextToSize(cell || "—", widths[i]! - 4).length)) * 4.4 + 3.5;
    const drawHeader = () => {
      this.doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
      this.doc.rect(M, this.y - 4.5, CONTENT_W, 7, "F");
      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(8.5);
      this.doc.setTextColor(255, 255, 255);
      let x = M + 2;
      headers.forEach((h, i) => {
        this.doc.text(h, x, this.y);
        x += widths[i]!;
      });
      this.y += 6.5;
    };
    // Header must never be orphaned from its first row.
    this.need(9 + (rows[0] ? rowHeight(rows[0]) : 8));
    drawHeader();

    rows.forEach((row, index) => {
      const cells = row.map((cell, i) => this.doc.splitTextToSize(cell || "—", widths[i]! - 4));
      const rowH = Math.max(...cells.map((c) => c.length)) * 4.4 + 3.5;
      if (this.y + rowH > PAGE_H - M - 10) {
        this.doc.addPage();
        this.y = M + 6;
        drawHeader();
      }
      if (index % 2 === 1) {
        this.doc.setFillColor(244, 244, 250);
        this.doc.rect(M, this.y - 4, CONTENT_W, rowH, "F");
      }
      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(8.5);
      this.doc.setTextColor(INK.r, INK.g, INK.b);
      let x = M + 2;
      cells.forEach((cell, i) => {
        this.doc.text(cell, x, this.y);
        x += widths[i]!;
      });
      this.y += rowH;
    });
    this.y += 3;
  }
}

function coverAndChrome(doc: Doc, plan: PlanResult) {
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    // Header band with the app logo mark + name.
    doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
    doc.rect(0, 0, PAGE_W, 12, "F");
    doc.setFillColor(255, 255, 255);
    doc.circle(M + 3, 6, 3, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
    doc.text("AI", M + 1.4, 7.2);
    doc.setFontSize(9.5);
    doc.setTextColor(255, 255, 255);
    doc.text("AI Travel Orchestrator", M + 9, 7.4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(
      `${plan.summary?.origin ?? ""} to ${plan.summary?.destination ?? ""}`.slice(0, 70),
      PAGE_W - M,
      7.4,
      { align: "right" },
    );

    // Footer with attribution + page numbers.
    doc.setDrawColor(224, 224, 234);
    doc.setLineWidth(0.3);
    doc.line(M, PAGE_H - 12, PAGE_W - M, PAGE_H - 12);
    doc.setFontSize(8);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    doc.text("Generated by AI Travel Orchestrator", M, PAGE_H - 7.5);
    doc.text(`Page ${page} of ${pages}`, PAGE_W - M, PAGE_H - 7.5, { align: "right" });
  }
}

/** Builds the document for one completed plan (no side effects). */
export async function buildPlanPdf(plan: PlanResult): Promise<Doc> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  const w = new Writer(doc);
  const s = plan.summary;
  const a = plan.assistant;

  // Title block
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(INK.r, INK.g, INK.b);
  doc.text(doc.splitTextToSize(`${s.destination} Travel Plan`, CONTENT_W), M, w.y);
  w.y += 9;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
  doc.text(
    `${s.origin} to ${s.destination} · ${niceDate(s.departureDate)} – ${niceDate(s.returnDate)} · ${s.travelType}`,
    M,
    w.y,
  );
  w.y += 5;
  doc.text("All prices, availability and weather details below are AI estimates.", M, w.y);
  w.y += 8;

  w.heading("Trip Overview");
  w.keyValues([
    ["Origin", s.origin],
    ["Destination", s.destination],
    ["Travel type", s.travelType],
    ["Travel dates", `${niceDate(s.departureDate)} – ${niceDate(s.returnDate)}`],
    ["Duration", `${s.durationDays} days · ${s.nights} nights`],
    ["Travellers", `${s.adults} adult(s), ${s.children} child(ren)`],
    ["Travel companion", s.companion || "—"],
    ["Trip purpose", s.purpose || "—"],
    ["Estimated budget", inr(s.budget)],
    ["Accommodation", s.accommodation || "—"],
    ["Transport preference", s.transportPreference || "—"],
    ["AI confidence score", `${s.confidence}%`],
  ]);
  w.body(`Preferences: ${(s.preferences ?? []).join(", ") || "—"}`, { muted: true });

  w.gap(3);
  w.heading("AI Decision Summary");
  w.body(s.decisionSummary || "—");

  if ((plan.flights ?? []).length) {
    w.gap(3);
    w.heading("Estimated Flight Recommendations");
    w.table(
      ["Airline / Flight", "Depart", "Arrive", "Duration", "Stops", "Est. price"],
      plan.flights.map((f) => [
        `${f.airline} ${f.code}`.trim(),
        f.depart,
        f.arrive,
        f.duration,
        f.stops,
        inr(f.price),
      ]),
      [46, 22, 22, 28, 32, 28],
    );
  }

  if ((plan.trains ?? []).length) {
    w.gap(3);
    w.heading("Estimated Train Recommendations");
    w.table(
      ["Train", "Number", "Depart", "Arrive", "Classes", "Est. price"],
      plan.trains.map((t) => [t.name, t.number, t.depart, t.arrive, t.classes, inr(t.price)]),
      [48, 22, 22, 22, 34, 30],
    );
  }

  if ((plan.hotels ?? []).length) {
    w.gap(3);
    w.heading("Estimated Hotel Recommendations");
    w.table(
      ["Hotel", "Rating", "Match", "Est. per night", "Distance"],
      plan.hotels.map((h) => [
        h.name,
        `${h.rating}`,
        `${h.matchScore}%`,
        inr(h.pricePerNight),
        h.distance,
      ]),
      [64, 20, 20, 38, 36],
    );
  }

  if ((plan.itinerary ?? []).length) {
    w.gap(3);
    w.heading("Day-wise Itinerary");
    plan.itinerary.forEach((day) => {
      w.need(34);
      w.subheading(`Day ${day.day} — ${day.title}`);
      w.body(`Morning: ${day.morning}`, { indent: 3 });
      w.body(`Afternoon: ${day.afternoon}`, { indent: 3 });
      w.body(`Evening: ${day.evening}`, { indent: 3 });
      w.body(`Transport: ${day.transport} · Estimated spend: ${inr(day.estimatedSpend)}`, {
        indent: 3,
        muted: true,
      });
      w.gap(2);
    });
  }

  if ((plan.experiences ?? []).length) {
    w.gap(3);
    w.heading("Experiences & Activities");
    plan.experiences.forEach((e) => {
      w.need(20);
      w.subheading(`${e.name} — ${e.category}`);
      w.body(e.description, { indent: 3 });
      w.body(`Duration: ${e.duration} · Rating: ${e.rating}`, { indent: 3, muted: true });
      w.gap(1.5);
    });
  }

  w.gap(3);
  w.heading("Estimated Budget Breakdown");
  w.table(
    ["Category", "Estimated amount"],
    (plan.budget?.breakdown ?? []).map((b) => [b.label, inr(b.value)]),
    [116, 62],
  );
  w.keyValues([
    ["Estimated total cost", inr(plan.budget?.total)],
    ["Estimated savings", inr(plan.budget?.savings)],
    ["Budget remaining", inr(plan.budget?.remaining)],
    ["Estimated budget entered", inr(s.budget)],
  ]);
  if ((plan.budget?.suggestions ?? []).length) {
    w.subheading("Savings suggestions");
    w.bullets(plan.budget.suggestions);
  }

  if ((a?.packingChecklist ?? []).length) {
    w.gap(3);
    w.heading("Packing Checklist");
    w.bullets(a.packingChecklist.map((item) => item));
  }

  if ((a?.weather ?? []).length) {
    w.gap(3);
    w.heading("Estimated Weather Information");
    w.table(
      ["Day", "Temperature", "Condition"],
      a.weather.map((d) => [d.day, d.temp, d.condition]),
      [60, 50, 68],
    );
  }

  w.gap(3);
  w.heading("Travel Guidance");
  if (a?.localTransportTips) {
    w.subheading("Local transport tips");
    w.body(a.localTransportTips);
  }
  if (a?.safetyTips) {
    w.subheading("Safety tips");
    w.body(a.safetyTips);
  }
  if (a?.travelReminders) {
    w.subheading("Travel reminders");
    w.body(a.travelReminders);
  }
  if (a?.currencyGuidance) {
    w.subheading("Currency guidance");
    w.body(a.currencyGuidance);
  }
  if (a?.visaInformation) {
    w.subheading("Visa information");
    w.body(a.visaInformation);
  }

  if ((a?.emergencyContacts ?? []).length) {
    w.gap(3);
    w.heading("Emergency Contacts");
    w.table(
      ["Contact", "Number / detail"],
      a.emergencyContacts.map((c) => [c.label, c.value]),
      [96, 82],
    );
  }

  if ((plan.insights ?? []).length) {
    w.gap(3);
    w.heading("AI Insights");
    w.bullets(plan.insights);
  }

  coverAndChrome(doc, plan);
  return doc;
}

/** Builds and directly downloads the PDF — never opens the print dialog. */
export async function exportPlanPdf(plan: PlanResult) {
  const doc = await buildPlanPdf(plan);
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = pdfFileName(plan);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
