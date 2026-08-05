import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  JWT_SECRET: z.string().min(1),
  JWT_EXPIRES_IN: z.string().default("7d"),
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),
  STORAGE_PROVIDER: z.enum(["local", "r2", "b2", "s3"]).default("local"),
  LOCAL_STORAGE_PATH: z.string().default("./uploads"),
  SMTP_ENABLED: z.coerce.boolean().default(false),
  SMTP_PROVIDER: z.enum(["gmail", "custom"]).default("gmail"),
  SMTP_HOST: z.string().default("smtp.gmail.com"),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  SMTP_FROM_NAME: z.string().default("BioPlatform"),
  SMTP_FROM_EMAIL: z.string().default(""),
  ADMIN_EMAIL: z.string().default("admin@bioplatform.com"),
  ADMIN_PASSWORD: z.string().default("admin123456"),
  WEBAUTHN_RP_ID: z.string().default("localhost"),
  WEBAUTHN_ORIGIN: z.string().default("http://localhost:80"),
  WEBAUTHN_RP_NAME: z.string().default("BioPlatform"),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function getEnv(): Env {
  if (_env) return _env;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error("Invalid environment variables:");
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }

  _env = result.data;
  return _env;
}
