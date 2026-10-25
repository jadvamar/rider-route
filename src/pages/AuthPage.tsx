import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, Users, Shield, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/store/useAuthStore";

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { login, signup } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await signup(name, email, password);
      }
      navigate("/dashboard");
    } catch (err) {
      if (isLogin && err instanceof Error && err.message === "Email not registered") {
        setIsLogin(false);
        setPassword("");
        setShowPassword(false);
        setError("No account found for this email. Create an account to continue.");
      } else {
        setError(err instanceof Error ? err.message : "Authentication failed");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      {/* Hero */}
      <div className="text-center mb-10">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4 glow-primary">
          <MapPin className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-3xl font-bold text-foreground tracking-tight">
          RideTrack
        </h1>
        <p className="text-muted-foreground mt-2 text-sm max-w-xs mx-auto">
          Real-time group riding — see every rider, stay on route, arrive
          together.
        </p>
      </div>

      {/* Features row */}
      <div className="flex gap-6 mb-8 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-primary" />
          Live Tracking
        </div>
        <div className="flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-accent" />
          Group Rides
        </div>
        <div className="flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-success" />
          SOS Alerts
        </div>
      </div>

      {/* Auth form */}
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <div className="glass-strong rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-foreground">
            {isLogin ? "Welcome back" : "Create account"}
          </h2>

          {!isLogin && (
            <Input
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required={!isLogin}
              className="bg-background/50 border-border/50"
            />
          )}
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="bg-background/50 border-border/50"
          />
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="bg-background/50 border-border/50 pr-12"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-10 w-10 text-muted-foreground hover:text-foreground"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              title={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Please wait..." : isLogin ? "Sign In" : "Sign Up"}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <p className="text-center text-sm text-muted-foreground">
          {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() => {
              setIsLogin(!isLogin);
              setShowPassword(false);
            }}
            className="text-primary hover:underline font-medium"
          >
            {isLogin ? "Sign up" : "Sign in"}
          </button>
        </p>
      </form>
    </div>
  );
}
