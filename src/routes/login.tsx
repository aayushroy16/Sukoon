import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, LockKeyhole, Mail, ShieldCheck, Trash2, Users } from "lucide-react";
import { deleteUser, getAuthStatus, listUsers, signIn, signOut, signUp } from "@/lib/auth";

type Portal = "user" | "admin";
type Account = {
  id: string;
  email: string;
  role: Portal;
  createdAt: string | null;
  lastSignInAt: string | null;
};

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Log in or sign up | Sukoon" },
      { name: "description", content: "Create a Sukoon account or log in to your saved music." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [portal, setPortal] = useState<Portal>("user");
  const [isSignUp, setIsSignUp] = useState(false);
  const [user, setUser] = useState<Account | null>(null);
  const [users, setUsers] = useState<Account[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getAuthStatus().then(async ({ user: active }) => {
      setUser(active);
      if (active?.role === "admin") {
        try {
          setUsers((await listUsers()).users);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Could not load user accounts.");
        }
      }
    });
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      if (isSignUp) {
        const result = await signUp({ data: { email, password } });
        if (!result.ok) throw new Error(result.message ?? "Could not create your account.");
        if (result.user) setUser(result.user);
        setMessage(result.message ?? "Your account has been created.");
      } else {
        const result = await signIn({ data: { email, password, portal } });
        if (!result.ok || !result.user) throw new Error(result.message ?? "Could not log in.");
        setUser(result.user);
        setMessage("You are logged in.");
        if (result.user.role === "admin") setUsers((await listUsers()).users);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    setUser(null);
    setUsers([]);
    setError("");
    setMessage("You have been logged out.");
  };

  const handleDelete = async (account: Account) => {
    if (!window.confirm(`Permanently delete the account ${account.email}?`)) return;
    try {
      await deleteUser({ data: { userId: account.id } });
      setUsers((current) => current.filter((item) => item.id !== account.id));
      setMessage(`Deleted ${account.email}.`);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete this account.");
    }
  };

  const choosePortal = (next: Portal) => {
    setPortal(next);
    setIsSignUp(false);
    setError("");
    setMessage("");
  };

  return (
    <div className="sk-container">
      <section className="sk-auth-section">
        <div className="sk-auth-copy">
          <span className="sk-eyebrow">Welcome to Sukoon</span>
          <h1 className="sk-h1">
            Your music, <span className="sk-gradient-text">saved.</span>
          </h1>
          <p className="sk-lead">
            Create an account to use Sukoon from any device. Administrators can manage registered
            accounts.
          </p>
        </div>

        <div className="sk-panel sk-auth-form">
          {user ? (
            <>
              <div className="sk-auth-heading">
                <span className="sk-auth-icon" aria-hidden="true">
                  {user.role === "admin" ? <ShieldCheck size={20} /> : <Users size={20} />}
                </span>
                <div>
                  <h2 className="sk-h2">
                    {user.role === "admin" ? "Admin dashboard" : "You're logged in"}
                  </h2>
                  <p className="sk-muted">{user.email}</p>
                </div>
              </div>

              {user.role === "admin" ? (
                <section aria-label="Registered users">
                  <div className="sk-admin-heading">
                    <h3 className="sk-h3">Registered accounts</h3>
                    <span className="sk-tag">{users.length} total</span>
                  </div>
                  {users.length ? (
                    <div className="sk-admin-users">
                      {users.map((account) => (
                        <article className="sk-admin-user" key={account.id}>
                          <div className="sk-admin-user-meta">
                            <strong>{account.email}</strong>
                            <span className="sk-muted">ID: {account.id}</span>
                            <span className="sk-muted">
                              Joined: {formatDate(account.createdAt)}
                            </span>
                            <span className="sk-muted">
                              Last login: {formatDate(account.lastSignInAt)}
                            </span>
                          </div>
                          {account.role === "user" ? (
                            <button
                              type="button"
                              className="sk-btn sk-btn-quiet sk-btn-sm"
                              onClick={() => handleDelete(account)}
                              aria-label={`Delete account ${account.email}`}
                            >
                              <Trash2 size={15} aria-hidden="true" /> Delete
                            </button>
                          ) : (
                            <span className="sk-tag">Admin</span>
                          )}
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="sk-muted">No accounts found.</p>
                  )}
                </section>
              ) : (
                <p className="sk-lead">Your account is active.</p>
              )}

              {error ? (
                <p className="sk-auth-error" role="alert">
                  {error}
                </p>
              ) : null}
              {message ? (
                <p className="sk-auth-success" role="status">
                  {message}
                </p>
              ) : null}
              <div className="sk-hero-actions">
                <Link to="/playlist" className="sk-btn sk-btn-primary">
                  Open playlist <ArrowRight size={16} />
                </Link>
                <button type="button" className="sk-btn sk-btn-quiet" onClick={handleLogout}>
                  Log out
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="sk-auth-heading">
                <span className="sk-auth-icon" aria-hidden="true">
                  {portal === "admin" ? <ShieldCheck size={20} /> : <LockKeyhole size={20} />}
                </span>
                <div>
                  <h2 className="sk-h2">
                    {isSignUp ? "Create account" : portal === "admin" ? "Admin login" : "Log in"}
                  </h2>
                  <p className="sk-muted">
                    {portal === "admin"
                      ? "Use the administrator account configured for this app."
                      : "Welcome back to your quiet corner."}
                  </p>
                </div>
              </div>

              <div className="sk-auth-tabs" role="group" aria-label="Choose account type">
                <button
                  type="button"
                  className={`sk-btn sk-btn-sm ${portal === "user" ? "sk-btn-primary" : "sk-btn-quiet"}`}
                  onClick={() => choosePortal("user")}
                >
                  User
                </button>
                <button
                  type="button"
                  className={`sk-btn sk-btn-sm ${portal === "admin" ? "sk-btn-primary" : "sk-btn-quiet"}`}
                  onClick={() => choosePortal("admin")}
                >
                  Admin
                </button>
              </div>

              {portal === "user" ? (
                <div className="sk-auth-switch" role="group" aria-label="Login or sign up">
                  <button
                    type="button"
                    className={isSignUp ? "is-selected" : ""}
                    onClick={() => {
                      setIsSignUp(true);
                      setError("");
                    }}
                  >
                    Sign up
                  </button>
                  <button
                    type="button"
                    className={!isSignUp ? "is-selected" : ""}
                    onClick={() => {
                      setIsSignUp(false);
                      setError("");
                    }}
                  >
                    Log in
                  </button>
                </div>
              ) : null}

              <form className="sk-auth-fields" onSubmit={(event) => void handleSubmit(event)}>
                <label className="sk-field">
                  <span>Email address</span>
                  <span className="sk-input-wrap">
                    <Mail size={17} aria-hidden="true" />
                    <input
                      className="sk-input"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@example.com"
                      autoComplete="email"
                      required
                    />
                  </span>
                </label>
                <label className="sk-field">
                  <span>Password{isSignUp ? " (8 characters minimum)" : ""}</span>
                  <span className="sk-input-wrap">
                    <LockKeyhole size={17} aria-hidden="true" />
                    <input
                      className="sk-input"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder={isSignUp ? "Create a password" : "Enter your password"}
                      autoComplete={isSignUp ? "new-password" : "current-password"}
                      minLength={isSignUp ? 8 : undefined}
                      required
                    />
                  </span>
                </label>
                {error ? (
                  <p className="sk-auth-error" role="alert">
                    {error}
                  </p>
                ) : null}
                {message ? (
                  <p className="sk-auth-success" role="status">
                    {message}
                  </p>
                ) : null}
                <button
                  type="submit"
                  className="sk-btn sk-btn-primary sk-auth-submit"
                  disabled={busy}
                >
                  {busy ? "Please wait…" : isSignUp ? "Create account" : "Log in"}{" "}
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              </form>
              <p className="sk-auth-note">
                <Link to="/">Explore Sukoon</Link>
              </p>
              <p className="sk-auth-demo">
                Accounts use Supabase and are available across devices.
              </p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toISOString().slice(0, 10);
}
