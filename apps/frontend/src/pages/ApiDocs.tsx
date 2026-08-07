import { useEffect, useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/landing/Footer";
import { branding } from "@/config/branding";
import { usePageMeta } from "@/lib/seo";

interface OpenApiDocument {
  info?: { title?: string; version?: string; description?: string };
  paths?: Record<string, Record<string, ApiOperation>>;
}

interface ApiOperation {
  tags?: string[];
  summary?: string;
  description?: string;
  security?: unknown[];
  parameters?: { name: string; in: string; required?: boolean; schema?: { type?: string; enum?: string[]; default?: number } }[];
  requestBody?: { required?: boolean; content?: Record<string, { schema?: { type?: string; properties?: Record<string, { type?: string; enum?: string[]; format?: string; minLength?: number; maxLength?: number; description?: string }>; required?: string[]; items?: unknown } }> };
  responses?: Record<string, { description?: string }>;
}

const METHOD_COLORS: Record<string, string> = {
  get: "bg-emerald-500/15 text-emerald-400",
  post: "bg-sky-500/15 text-sky-400",
  put: "bg-amber-500/15 text-amber-400",
  patch: "bg-violet-500/15 text-violet-400",
  delete: "bg-red-500/15 text-red-400",
};

function propertySummary(props: Record<string, { type?: string; enum?: string[]; format?: string; minLength?: number; maxLength?: number; description?: string }> | undefined): string {
  if (!props) return "";
  const parts = Object.entries(props).map(([name, p]) => {
    const type = p.type ?? "string";
    const constraints = [p.format, p.enum ? p.enum.join("|") : undefined, p.minLength != null ? `min ${p.minLength}` : undefined, p.maxLength != null ? `max ${p.maxLength}` : undefined].filter(Boolean).join(", ");
    return `${name} (${type}${constraints ? `: ${constraints}` : ""})`;
  });
  return parts.join(" · ");
}

export function ApiDocs() {
  const [doc, setDoc] = useState<OpenApiDocument | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  usePageMeta({ title: "API Documentation", description: `Explore the ${branding.name} public API — endpoints, parameters, and examples.`, url: "/api-docs" });

  useEffect(() => {
    fetch("/api/openapi.json")
      .then((res) => {
        if (!res.ok) throw new Error("Could not load API spec");
        return res.json() as Promise<OpenApiDocument>;
      })
      .then((data) => {
        setDoc(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not load API spec");
        setLoading(false);
      });
  }, []);

  const paths = doc?.paths ?? {};
  const grouped = Object.entries(paths).map(([path, methods]) => ({
    path,
    operations: Object.entries(methods).map(([method, op]) => ({ method, op })),
  }));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="mx-auto max-w-4xl px-4 py-12 sm:py-16">
        <h1 className="text-3xl font-bold text-white">API Reference</h1>
        <p className="text-sm text-zinc-400 mt-2">
          {branding.name} REST API — OpenAPI 3.0. Raw spec available at{" "}
          <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300">/api/openapi.json</code>
        </p>
        <p className="text-sm text-zinc-500 mt-4 leading-relaxed">
          Most endpoints require an <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400">Authorization: Bearer &lt;token&gt;</code> header.
          Tokens are returned by <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400">POST /api/auth/login</code> and{" "}
          <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400">POST /api/auth/register</code>. Errors use a consistent{" "}
          <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400">{"{ success: false, error: string }"}</code> shape.
        </p>

        {loading && <p className="text-sm text-zinc-500 mt-8">Loading API spec...</p>}
        {error && (
          <div className="mt-8 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">{error}</div>
        )}

        {doc && (
          <div className="mt-10 space-y-6">
            {grouped.map(({ path, operations }) => (
              <section key={path} className="rounded-xl border border-zinc-800 bg-zinc-900/30 overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-800 bg-zinc-950/40">
                  <span className="text-sm font-mono text-violet-300 break-all">{path}</span>
                </div>
                <div className="divide-y divide-zinc-800/70">
                  {operations.map(({ method, op }) => (
                    <div key={`${method}-${path}`} className="px-5 py-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <span
                          className={`text-xs font-bold uppercase px-2.5 py-1 rounded-md ${METHOD_COLORS[method] ?? "bg-zinc-700 text-zinc-300"}`}
                        >
                          {method}
                        </span>
                        {op.summary && <span className="text-sm font-medium text-white">{op.summary}</span>}
                        {op.security === undefined && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">public</span>
                        )}
                      </div>

                      {op.description && <p className="text-xs text-zinc-500 mt-2 leading-relaxed">{op.description}</p>}

                      {op.parameters && op.parameters.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs font-medium text-zinc-400 mb-1">Parameters</p>
                          <div className="flex flex-wrap gap-2">
                            {op.parameters.map((p) => (
                              <span key={`${p.in}-${p.name}`} className="text-xs px-2.5 py-1 rounded-md bg-zinc-800/80 text-zinc-300">
                                {p.name}
                                {p.required ? <span className="text-red-400"> *</span> : ""}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {op.requestBody && (
                        <div className="mt-3">
                          <p className="text-xs font-medium text-zinc-400 mb-1">Request body</p>
                          <div className="rounded-lg bg-zinc-950/60 border border-zinc-800 px-3 py-2">
                            {Object.entries(op.requestBody.content ?? {}).map(([contentType, body]) => {
                              const props = body.schema?.type === "object" ? body.schema.properties : undefined;
                              const required = body.schema?.type === "object" ? body.schema.required : undefined;
                              return (
                                <div key={contentType}>
                                  <code className="text-xs text-zinc-500">{contentType}</code>
                                  {props && (
                                    <p className="text-xs text-zinc-300 mt-1">
                                      {propertySummary(props)}
                                      {required && required.length > 0 ? (
                                        <span className="text-zinc-500"> — required: {required.join(", ")}</span>
                                      ) : (
                                        ""
                                      )}
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="mt-3 flex flex-wrap gap-2">
                        {Object.keys(op.responses ?? {}).map((status) => (
                          <span key={status} className="text-xs px-2.5 py-1 rounded-full bg-zinc-800/80 text-zinc-400">
                            {status} {op.responses?.[status]?.description ?? ""}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
