import { SQUASH_CITY_URL } from "@/constants";
import type { Session } from "@/types";
import { config } from "@/utils/config";
import { logger } from "@/utils/logger";

const LOGIN_URL = `${SQUASH_CITY_URL}/auth/login`;

export async function login(): Promise<Session> {
  logger.info("Logging in to SquashCity");

  const { username, password } = config.squashCityCredentials;

  const formData = new URLSearchParams({
    username,
    password,
  });

  const response = await fetch(LOGIN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
    body: formData.toString(),
    redirect: "manual", // Handle redirects manually to capture cookies
  });

  const cookies = response.headers.getSetCookie();

  if (cookies.length === 0) {
    throw new Error("No session cookies received from login response");
  }

  if (response.status !== 302 && response.status !== 200) {
    throw new Error(`Login failed with status ${response.status}`, { cause: response });
  }

  const session: Session = { cookies };

  return session;
}
