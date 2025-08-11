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
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 portrait in points
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let { width, height } = page.getSize();
  let x = 50;
  let y = height - 60;

  const drawText = (text: string, opts: { size?: number; bold?: boolean; color?: any } = {}) => {
    const size = opts.size ?? 12;
    const usedFont = opts.bold ? fontBold : font;
    page.drawText(text, { x, y, size, font: usedFont, color: opts.color ?? rgb(0, 0, 0) });
    y -= size + 8;
  };

  // Header
  drawText("Tracker - Time Entries Report", { size: 18, bold: true });
  drawText(`Date range: ${start} to ${end}`, { size: 12 });
  y -= 8;
  page.drawLine({ start: { x, y }, end: { x: width - 50, y }, thickness: 1, color: rgb(0.8, 0.8, 0.8) });
  y -= 16;

  // Table header
  drawText("Date      | Project | Duration (min)", { bold: true });
  drawText("Description:");

  let total = 0;

  const addPageIfNeeded = () => {
    if (y < 80) {
      const newPage = pdfDoc.addPage([595.28, 841.89]);
      width = newPage.getSize().width;
      height = newPage.getSize().height;
      y = height - 60;
      (page as any) = newPage;
      // Re-embed fonts for the new page context
      // Note: pdf-lib embeds fonts in doc scope; reuse refs
    }
  };

  for (const e of entries) {
    const dateStr = e.entry_date;
    const line1 = `${dateStr} | ${e.project_code} | ${e.duration_minutes}`;
    total += e.duration_minutes || 0;

    addPageIfNeeded();
    drawText(line1, { size: 12 });
    const desc = (e.description || "").toString();

    // Wrap description roughly at 90 chars
    const wrapAt = 90;
    let startIdx = 0;
    while (startIdx < desc.length) {
      addPageIfNeeded();
      const chunk = desc.slice(startIdx, startIdx + wrapAt);
      drawText(chunk, { size: 11, color: rgb(0.2, 0.2, 0.2) });
      startIdx += wrapAt;
    }

    y -= 6;
    page.drawLine({ start: { x, y }, end: { x: width - 50, y }, thickness: 0.5, color: rgb(0.9, 0.9, 0.9) });
    y -= 10;
  }

  // Summary
  y -= 10;
  drawText(`Total minutes: ${total}`, { bold: true });

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
