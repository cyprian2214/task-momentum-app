import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { format, parseISO } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Calendar as CalendarIcon, ChevronDown, LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [sessionReady, setSessionReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [entryDate, setEntryDate] = useState<string>(today);
  const [description, setDescription] = useState("");
  const [durationHours, setDurationHours] = useState<number>(1);
  const [durationMinutes, setDurationMinutes] = useState<number>(0);
  const [projectCode, setProjectCode] = useState("");
  const [rangeStart, setRangeStart] = useState<string>(today);
  const [rangeEnd, setRangeEnd] = useState<string>(today);

  const selectedEntryDate = useMemo(() => parseISO(entryDate), [entryDate]);

  useEffect(() => {
    document.title = "Time Tracking Dashboard - Tracker";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Track work with hours and minutes, browse past entries, and export professional PDFs.");

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
      setUser(session?.user ?? null);
      if (!session) navigate("/auth", { replace: true });
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
      setUser(session?.user ?? null);
      if (!session) navigate("/auth", { replace: true });
      setSessionReady(true);
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const { data: entries, isLoading } = useQuery({
    queryKey: ["time_entries", userId, entryDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_entries")
        .select("id, entry_date, project_code, description, duration_minutes, created_at")
        .eq("user_id", userId)
        .eq("entry_date", entryDate)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!userId && sessionReady,
  });

  const handleAdd = async () => {
    if (!userId) return;
    const totalMinutes = (Number.isFinite(durationHours) ? durationHours : 0) * 60 + (Number.isFinite(durationMinutes) ? durationMinutes : 0);
    if (!description || !projectCode || totalMinutes <= 0) {
      toast({ title: "Missing info", description: "Please fill description, hours/minutes, and project code.", variant: "destructive" as any });
      return;
    }
    const { error } = await supabase.from("time_entries").insert({
      user_id: userId,
      entry_date: entryDate,
      project_code: projectCode,
      description,
      duration_minutes: totalMinutes,
    });
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" as any });
    } else {
      toast({ title: "Entry saved", description: "Your time entry was recorded." });
      setDescription("");
      setDurationHours(1);
      setDurationMinutes(0);
      setProjectCode("");
      queryClient.invalidateQueries({ queryKey: ["time_entries", userId, entryDate] });
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  const handleDownload = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("download-time-entries-pdf", {
        body: { start_date: rangeStart, end_date: rangeEnd },
      });
      if (error) throw error;

      const { base64, filename, mimeType } = data as any;
      if (!base64) throw new Error("No PDF data returned");

      // Decode base64 safely (chunked) to avoid memory issues
      const b64ToBlob = (b64: string, type = "application/pdf") => {
        const sliceSize = 1024;
        const byteChars = atob(b64);
        const byteArrays: Uint8Array[] = [];
        for (let offset = 0; offset < byteChars.length; offset += sliceSize) {
          const slice = byteChars.slice(offset, offset + sliceSize);
          const byteNumbers = new Array(slice.length);
          for (let i = 0; i < slice.length; i++) byteNumbers[i] = slice.charCodeAt(i);
          byteArrays.push(new Uint8Array(byteNumbers));
        }
        return new Blob(byteArrays, { type });
      };

      const blob = b64ToBlob(base64, mimeType || "application/pdf");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || `time-entries-${rangeStart}_to_${rangeEnd}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Download ready", description: "Your PDF has been downloaded." });
    } catch (e: any) {
      // Fallback: try opening a data URL if Blob flow fails
      try {
        const { data } = await supabase.functions.invoke("download-time-entries-pdf", {
          body: { start_date: rangeStart, end_date: rangeEnd },
        });
        const { base64, filename } = (data || {}) as any;
        if (base64) {
          const dataUrl = `data:application/pdf;base64,${base64}`;
          const win = window.open(dataUrl, "_blank");
          if (!win) throw e;
          return;
        }
      } catch {}
      toast({ title: "Download failed", description: e?.message || "Unknown error", variant: "destructive" as any });
    }
  };
  const displayName = user?.user_metadata?.full_name || user?.email || "Account";

  return (
    <main className="min-h-screen bg-background">
      <header className="container mx-auto px-4 py-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tracker</h1>
        <nav className="flex items-center gap-3">
          <ThemeToggle />
          {userId && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" className="inline-flex items-center gap-2">
                  <span className="max-w-[200px] truncate">{displayName}</span>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-50 bg-popover">
                <DropdownMenuLabel className="max-w-[260px] truncate">{displayName}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive-foreground">
                  <LogOut className="h-4 w-4 mr-2" /> Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </nav>
      </header>

      <section className="container mx-auto px-4 pb-16">
        <div className="mx-auto max-w-3xl grid gap-6">
          <div className="grid gap-4 rounded-lg border bg-card p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="justify-start gap-2">
                      <CalendarIcon className="h-4 w-4" />
                      {format(selectedEntryDate, "PPP")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={selectedEntryDate}
                      onSelect={(d) => d && setEntryDate(format(d, "yyyy-MM-dd"))}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Hours</label>
                <Input
                  type="number"
                  min={0}
                  value={durationHours}
                  onChange={(e) => setDurationHours(Math.max(0, parseInt(e.target.value || "0", 10)))}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Minutes</label>
                <Input
                  type="number"
                  min={0}
                  max={59}
                  value={durationMinutes}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(59, parseInt(e.target.value || "0", 10)));
                    setDurationMinutes(v);
                  }}
                />
              </div>
              <div className="grid gap-2 md:col-span-3">
                <label htmlFor="project" className="text-sm font-medium">Project code</label>
                <Input id="project" placeholder="e.g., PROJ-123" value={projectCode} onChange={(e) => setProjectCode(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-2">
              <label htmlFor="desc" className="text-sm font-medium">What did you do?</label>
              <Textarea id="desc" placeholder="Describe your work..." value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="flex flex-col md:flex-row gap-3 md:items-end md:justify-between">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full md:w-auto">
                <div className="grid gap-2">
                  <label htmlFor="range-start" className="text-sm font-medium">From</label>
                  <Input id="range-start" type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <label htmlFor="range-end" className="text-sm font-medium">To</label>
                  <Input id="range-end" type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={handleDownload}>Download PDF</Button>
                <Button onClick={handleAdd}>Add entry</Button>
              </div>
            </div>
          </div>

          <div className="grid gap-3">
            <h2 className="text-lg font-medium">Entries for {entryDate}</h2>
            <div className="grid gap-3">
              {isLoading ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : entries && entries.length > 0 ? (
                entries.map((e: any) => (
                  <article key={e.id} className="rounded-md border p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{new Date(e.created_at).toLocaleTimeString()}</span>
                      <span className="text-sm font-medium">{e.project_code}</span>
                    </div>
                    <p className="mt-2">{e.description}</p>
                    <div className="mt-2 text-sm text-muted-foreground">Duration: {Math.floor((e.duration_minutes || 0)/60)}h {(e.duration_minutes || 0)%60}m</div>
                  </article>
                ))
              ) : (
                <p className="text-muted-foreground">No entries yet for this date.</p>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default Index;
