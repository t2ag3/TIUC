export type AppEnv = Env & {
  AUTH_SECRET: string;
  HASH_SALT?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  ADMIN_EMAILS?: string;
};

export type CookieAttrs = "" | "; Secure";
