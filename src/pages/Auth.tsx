import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";

const Auth = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // SEO tags
    document.title = "Login & Signup - Tracker";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Login or create an account to use the Tracker time tracking app.");

    // Auth state listener then session check
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) navigate("/", { replace: true });
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/", { replace: true });
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleLogin = async () => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast({ title: "Signed in", description: "Welcome back!" });
      navigate("/", { replace: true });
    } catch (e: any) {
      toast({ title: "Sign in failed", description: e.message, variant: "destructive" as any });
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async () => {
    try {
      setLoading(true);
      const redirectUrl = `${window.location.origin}/`;
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectUrl },
      });
      if (error) throw error;
      toast({
        title: "Check your email",
        description: "We sent a confirmation link. After confirming, you’ll be redirected here.",
      });
    } catch (e: any) {
      toast({ title: "Sign up failed", description: e.message, variant: "destructive" as any });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <section className="w-full max-w-md">
        <h1 className="sr-only">Tracker authentication</h1>
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-center">Tracker</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="signup">Sign up</TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="mt-4">
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="email-login">Email</Label>
                    <Input id="email-login" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="password-login">Password</Label>
                    <Input id="password-login" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <Button onClick={handleLogin} disabled={loading} className="w-full">{loading ? "Loading..." : "Sign in"}</Button>
                </div>
              </TabsContent>

              <TabsContent value="signup" className="mt-4">
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="email-signup">Email</Label>
                    <Input id="email-signup" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="password-signup">Password</Label>
                    <Input id="password-signup" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <Button onClick={handleSignup} disabled={loading} className="w-full">{loading ? "Loading..." : "Create account"}</Button>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
          <CardFooter className="justify-center text-sm text-muted-foreground">
            <Link to="/" className="underline underline-offset-4">Back to app</Link>
          </CardFooter>
        </Card>
      </section>
    </main>
  );
};

export default Auth;
