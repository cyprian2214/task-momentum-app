import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [sessionReady, setSessionReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [entryDate, setEntryDate] = useState<string>(today);
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState<number>(60);
  const [projectCode, setProjectCode] = useState("");
  const [rangeStart, setRangeStart] = useState<string>(today);
  const [rangeEnd, setRangeEnd] = useState<string>(today);

  useEffect(() => {
    document.title = "Time Tracking Dashboard - Tracker";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Track what you worked on today, for how long, and which project code.");

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
      if (!session) navigate("/auth", { replace: true });
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
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
    if (!description || !projectCode || !duration) {
      toast({ title: "Missing info", description: "Please fill description, duration, and project code.", variant: "destructive" as any });
      return;
    }
    const { error } = await supabase.from("time_entries").insert({
      user_id: userId,
      entry_date: entryDate,
      project_code: projectCode,
      description,
      duration_minutes: duration,
    });
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" as any });
    } else {
      toast({ title: "Entry saved", description: "Your time entry was recorded." });
      setDescription("");
      setDuration(60);
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
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: mimeType || "application/pdf" });
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
      toast({ title: "Download failed", description: e.message, variant: "destructive" as any });
    }
  };
  return (
    <main className="min-h-screen bg-background">
      <header className="container mx-auto px-4 py-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tracker</h1>
        <nav className="flex items-center gap-3">
          <Link to="/auth" className="text-sm underline underline-offset-4">Auth</Link>
          {userId && (
            <Button variant="secondary" onClick={handleLogout}>Logout</Button>
          )}
        </nav>
      </header>

      <section className="container mx-auto px-4 pb-16">
        <div className="mx-auto max-w-3xl grid gap-6">
          <div className="grid gap-4 rounded-lg border bg-card p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="grid gap-2">
                <label htmlFor="entry-date" className="text-sm font-medium">Date</label>
                <Input id="entry-date" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <label htmlFor="duration" className="text-sm font-medium">Duration (minutes)</label>
                <Input id="duration" type="number" min={1} value={duration} onChange={(e) => setDuration(parseInt(e.target.value || "0", 10))} />
              </div>
              <div className="grid gap-2">
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
                    <div className="mt-2 text-sm text-muted-foreground">Duration: {e.duration_minutes} min</div>
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
