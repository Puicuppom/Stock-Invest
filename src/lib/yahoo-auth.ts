const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface YahooAuth {
  cookie: string;
  crumb: string;
  expires: number;
}

let cachedAuth: YahooAuth | null = null;

function parseCookies(response: Response): string {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };

  if (typeof headers.getSetCookie === "function") {
    return headers
      .getSetCookie()
      .map((entry) => entry.split(";")[0])
      .join("; ");
  }

  const single = response.headers.get("set-cookie");
  if (!single) return "";
  return single
    .split(",")
    .map((entry) => entry.split(";")[0].trim())
    .join("; ");
}

export async function getYahooAuth(): Promise<YahooAuth> {
  if (cachedAuth && Date.now() < cachedAuth.expires) {
    return cachedAuth;
  }

  const cookieResponse = await fetch("https://fc.yahoo.com", {
    headers: { "User-Agent": USER_AGENT },
    redirect: "manual",
  });

  const cookie = parseCookies(cookieResponse);
  const crumbResponse = await fetch(
    "https://query1.finance.yahoo.com/v1/test/getcrumb",
    {
      headers: {
        "User-Agent": USER_AGENT,
        Cookie: cookie,
      },
    }
  );

  if (!crumbResponse.ok) {
    throw new Error("Failed to get Yahoo crumb");
  }

  const crumb = await crumbResponse.text();
  cachedAuth = {
    cookie,
    crumb,
    expires: Date.now() + 30 * 60 * 1000,
  };

  return cachedAuth;
}

export { USER_AGENT };
