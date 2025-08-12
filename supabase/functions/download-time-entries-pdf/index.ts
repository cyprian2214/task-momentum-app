// Edge function: download-time-entries-pdf
// Generates a PDF of the authenticated user's time entries for a given date range

import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RangeRequest {
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
}

async function fetchEntries(req: Request, start: string, end: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: req.headers.get("Authorization") || "" },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("time_entries")
    .select("entry_date, project_code, description, duration_minutes, created_at")
    .gte("entry_date", start)
    .lte("entry_date", end)
    .order("entry_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

async function buildPdf(entries: Array<any>, start: string, end: string) {
  const pdfDoc = await PDFDocument.create();

  const pageSize: [number, number] = [595.28, 841.89]; // A4
  let page = pdfDoc.addPage(pageSize);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Layout constants
  const margin = 40;
  const headerHeight = 56;
  const rowHeight = 22;
  const tableTopGap = 18;
  const tableCols = [100, 140, 70, 210]; // Date, Project, Duration, Description

  const colors = {
    text: rgb(0.1, 0.1, 0.12),
    muted: rgb(0.45, 0.45, 0.5),
    primary: rgb(0.13, 0.2, 0.36),
    band: rgb(0.93, 0.95, 1.0),
    border: rgb(0.82, 0.85, 0.9),
    zebra: rgb(0.97, 0.98, 1.0),
  };

  let y = page.getSize().height - margin;

  const addHeader = () => {
    // Brand band
    page.drawRectangle({ x: 0, y: page.getSize().height - headerHeight, width: page.getSize().width, height: headerHeight, color: colors.band });
    page.drawText("Tracker — Time Entries Report", { x: margin, y: page.getSize().height - headerHeight + 20, size: 18, font: bold, color: colors.primary });
    page.drawText(`Date range: ${start} to ${end}`, { x: margin, y: page.getSize().height - headerHeight + 6, size: 11, font, color: colors.muted });
  };

  const addTableHeader = () => {
    y = page.getSize().height - headerHeight - tableTopGap;
    const headers = ["Date", "Project", "Duration", "Description"];
    let x = margin;
    headers.forEach((h, i) => {
      page.drawText(h, { x, y, size: 11, font: bold, color: colors.text });
      x += tableCols[i];
    });
    y -= 8;
    page.drawLine({ start: { x: margin, y }, end: { x: page.getSize().width - margin, y }, thickness: 1, color: colors.border });
    y -= 6;
  };

  const addNewPage = () => {
    page = pdfDoc.addPage(pageSize);
    addHeader();
    addTableHeader();
  };

  addHeader();
  addTableHeader();

  let total = 0;

  const writeWrappedText = (text: string, maxWidth: number, lineHeight: number) => {
    const words = (text || "").split(/\s+/);
    const lines: string[] = [];
    let current = "";
    words.forEach((w) => {
      const tentative = current ? current + " " + w : w;
      const width = font.widthOfTextAtSize(tentative, 11);
      if (width > maxWidth && current) {
        lines.push(current);
        current = w;
      } else {
        current = tentative;
      }
    });
    if (current) lines.push(current);
    return lines;
  };

  for (const e of entries) {
    const hours = Math.floor((e.duration_minutes || 0) / 60);
    const mins = (e.duration_minutes || 0) % 60;
    total += e.duration_minutes || 0;

    const cells = [
      String(e.entry_date),
      String(e.project_code || "-"),
      `${hours}h ${mins}m`,
      String(e.description || ""),
    ];

    // Calculate wrapped description height
    const descLines = writeWrappedText(cells[3], tableCols[3] - 4, 12);
    const neededHeight = Math.max(rowHeight, descLines.length * 14);

    if (y - neededHeight < margin + 40) {
      addNewPage();
    }

    // Zebra row
    page.drawRectangle({ x: margin - 4, y: y - neededHeight + 4, width: page.getSize().width - 2 * (margin - 4), height: neededHeight, color: colors.zebra });

    // Draw cells
    let x = margin;
    // Date
    page.drawText(cells[0], { x, y, size: 11, font, color: colors.text });
    x += tableCols[0];
    // Project
    page.drawText(cells[1], { x, y, size: 11, font, color: colors.text });
    x += tableCols[1];
    // Duration
    page.drawText(cells[2], { x, y, size: 11, font, color: colors.text });
    x += tableCols[2];
    // Description (wrapped)
    let dy = y;
    descLines.forEach((line) => {
      page.drawText(line, { x, y: dy, size: 11, font, color: colors.muted });
      dy -= 14;
    });

    y -= neededHeight + 6;
  }

  // Summary footer
  if (y < margin + 40) addNewPage();
  const totalHours = Math.floor(total / 60);
  const totalMins = total % 60;
  page.drawLine({ start: { x: margin, y }, end: { x: page.getSize().width - margin, y }, thickness: 1, color: colors.border });
  y -= 14;
  page.drawText(`Total: ${totalHours}h ${totalMins}m (${total} minutes)`, { x: margin, y, size: 12, font: bold, color: colors.primary });

  const bytes = await pdfDoc.save();
  const b64 = btoa(String.fromCharCode(...bytes));
  return { base64: b64, total };
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { start_date, end_date } = (await req.json()) as RangeRequest;
    if (!start_date || !end_date) {
      return new Response(JSON.stringify({ error: "start_date and end_date are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const entries = await fetchEntries(req, start_date, end_date);
    const { base64, total } = await buildPdf(entries, start_date, end_date);

    const filename = `time-entries-${start_date}_to_${end_date}.pdf`;

    return new Response(
      JSON.stringify({ base64, filename, mimeType: "application/pdf", count: entries.length, total_minutes: total }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (err: any) {
    console.error("download-time-entries-pdf error:", err?.message || err);
    return new Response(JSON.stringify({ error: err?.message || "Unknown error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
