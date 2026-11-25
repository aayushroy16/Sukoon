import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, getCookie, getRequestUrl, setCookie } from "@tanstack/react-start/server";

const SESSION_COOKIE = "sukoon_supabase_session";
const SESSION_AGE = 60 * 60 * 24 * 7;

type SupabaseUser = {
  id: string;
  email?: string;
  created_at?: string;
  last_sign_in_at?: string;
};
type Tokens = { access_token: string; refresh_token: string };
type Account = {
  id: string;
  email: string;
  role: "user" | "admin";
  createdAt: string | null;
  lastSignInAt: string | null;
};
type AuthResponse = {
  access_token?: string;
  refresh_token?: string;
  user?: SupabaseUser;
  msg?: string;
  message?: string;
  error_description?: string;
};

function getConfig() {
  const url = process.env["SUPABASE_URL"]?.replace(/\/$/, "");
  const anonKey = process.env["SUPABASE_ANON_KEY"];
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  const adminEmail = process.env["SUKOON_ADMIN_EMAIL"]?.trim().toLowerCase();
  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in the server environment.",
    );
  }
  return { url, anonKey, serviceKey, adminEmail };
}

function setSession(tokens: Tokens) {
  setCookie(SESSION_COOKIE, JSON.stringify(tokens), {
    httpOnly: true,
    secure: getRequestUrl().protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_AGE,
  });
}

function toAccount(user: SupabaseUser, adminEmail?: string): Account | null {
  if (!user.email) return null;
  return {
    id: user.id,
    email: user.email,
    role: user.email.toLowerCase() === adminEmail ? "admin" : "user",
    createdAt: user.created_at ?? null,
    lastSignInAt: user.last_sign_in_at ?? null,
  };
}

async function authRequest(path: string, body: unknown): Promise<AuthResponse> {
  const { url, anonKey } = getConfig();
  const response = await fetch(`${url}/auth/v1/${path}`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as AuthResponse;
  if (!response.ok) {
    throw new Error(
      result.msg ?? result.message ?? result.error_description ?? "Authentication request failed.",
    );
  }
  return result;
}

async function getSignedInUser(): Promise<SupabaseUser | null> {
  const stored = getCookie(SESSION_COOKIE);
  if (!stored) return null;
  const { url, anonKey } = getConfig();
  let tokens: Tokens;
  try {
    tokens = JSON.parse(stored) as Tokens;
  } catch {
    return null;
  }
  let response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${tokens.access_token}` },
  });
  if (response.status === 401 && tokens.refresh_token) {
    const refreshed = await authRequest("token?grant_type=refresh_token", {
      refresh_token: tokens.refresh_token,
    });
    if (!refreshed.access_token || !refreshed.refresh_token) return null;
    const nextTokens = {
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
    };
    setSession(nextTokens);
    response = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${nextTokens.access_token}` },
    });
  }
  if (!response.ok) return null;
  return (await response.json()) as SupabaseUser;
}

export const signUp = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string; password: string }) => data)
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email))
      return { ok: false, message: "Enter a valid email address." };
    if (data.password.length < 8)
      return { ok: false, message: "Use a password with at least 8 characters." };
    try {
      const { adminEmail } = getConfig();
      if (email === adminEmail) {
        return {
          ok: false,
          message:
            "Create the administrator account in Supabase first; it cannot be registered here.",
        };
      }
      const result = await authRequest("signup", { email, password: data.password });
      const hasSession = Boolean(result.access_token && result.refresh_token);
      if (result.access_token && result.refresh_token) {
        setSession({ access_token: result.access_token, refresh_token: result.refresh_token });
      }
      return {
        ok: true,
        user: hasSession && result.user ? toAccount(result.user, adminEmail) : null,
        message: hasSession
          ? "Your account is ready."
          : "Check your email to confirm your account, then log in.",
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Could not create your account.",
      };
    }
  });

export const signIn = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string; password: string; portal: "user" | "admin" }) => data)
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    try {
      const { adminEmail } = getConfig();
      if (data.portal === "admin" && !adminEmail) {
        return {
          ok: false,
          message: "Admin login is unavailable until SUKOON_ADMIN_EMAIL is configured.",
        };
      }
      const result = await authRequest("token?grant_type=password", {
        email,
        password: data.password,
      });
      if (!result.user || !result.access_token || !result.refresh_token) {
        return { ok: false, message: "Login failed." };
      }
      const isAdmin = email === adminEmail;
      if (data.portal === "admin" && !isAdmin) {
        return { ok: false, message: "This account does not have administrator access." };
      }
      if (data.portal === "user" && isAdmin) {
        return { ok: false, message: "Use the Admin login option for this account." };
      }
      setSession({ access_token: result.access_token, refresh_token: result.refresh_token });
      return { ok: true, user: toAccount(result.user, adminEmail) };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error && error.message.startsWith("Supabase is not configured")
            ? error.message
            : "Email or password is incorrect. Confirm your email if you just signed up.",
      };
    }
  });

export const getAuthStatus = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const [{ adminEmail }, user] = await Promise.all([
      Promise.resolve(getConfig()),
      getSignedInUser(),
    ]);
    return { user: user ? toAccount(user, adminEmail) : null };
  } catch {
    return { user: null };
  }
});

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  const stored = getCookie(SESSION_COOKIE);
  if (stored) {
    try {
      const tokens = JSON.parse(stored) as Tokens;
      const { url, anonKey } = getConfig();
      await fetch(`${url}/auth/v1/logout`, {
        method: "POST",
        headers: { apikey: anonKey, Authorization: `Bearer ${tokens.access_token}` },
      });
    } catch {
      // Always clear the local cookie, even if the remote sign-out fails.
    }
  }
  deleteCookie(SESSION_COOKIE, { path: "/" });
  return { ok: true };
});

export const listUsers = createServerFn({ method: "GET" }).handler(async () => {
  const [{ adminEmail, serviceKey, url }, user] = await Promise.all([
    Promise.resolve(getConfig()),
    getSignedInUser(),
  ]);
  if (!user?.email || user.email.toLowerCase() !== adminEmail) {
    throw new Error("Administrator access required.");
  }
  if (!serviceKey) throw new Error("Set SUPABASE_SERVICE_ROLE_KEY to enable user management.");
  const response = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1000`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!response.ok) throw new Error("Could not load user accounts.");
  const result = (await response.json()) as { users?: SupabaseUser[] };
  return {
    users: (result.users ?? [])
      .map((account) => toAccount(account, adminEmail))
      .filter((account): account is Account => account !== null),
  };
});

export const deleteUser = createServerFn({ method: "POST" })
  .inputValidator((data: { userId: string }) => data)
  .handler(async ({ data }) => {
    const [{ adminEmail, serviceKey, url }, user] = await Promise.all([
      Promise.resolve(getConfig()),
      getSignedInUser(),
    ]);
    if (!user?.email || user.email.toLowerCase() !== adminEmail) {
      throw new Error("Administrator access required.");
    }
    if (!serviceKey) throw new Error("Set SUPABASE_SERVICE_ROLE_KEY to enable user management.");
    if (!/^[0-9a-f-]{36}$/i.test(data.userId)) throw new Error("Invalid user id.");
    if (data.userId === user.id)
      throw new Error("You cannot delete the account you are currently using.");
    const targetResponse = await fetch(`${url}/auth/v1/admin/users/${data.userId}`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!targetResponse.ok) throw new Error("Could not find this user account.");
    const target = (await targetResponse.json()) as SupabaseUser;
    if (target.email?.toLowerCase() === adminEmail) {
      throw new Error("The administrator account cannot be deleted here.");
    }
    const response = await fetch(`${url}/auth/v1/admin/users/${data.userId}`, {
      method: "DELETE",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!response.ok) throw new Error("Could not delete this user account.");
    return { ok: true };
  });
