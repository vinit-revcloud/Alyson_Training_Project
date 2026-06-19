import { createCsrfMiddleware, createStart, createMiddleware } from "@tanstack/react-start";

import { attachDbAuth } from "@/integrations/neon/auth-attacher";
import { renderErrorPage } from "./lib/error-page";

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    const request = await import("@tanstack/react-start/server").then((m) => m.getRequest());
    const path = request?.url ? new URL(request.url).pathname : "";
    if (path.startsWith("/api/")) {
      const message = error instanceof Error ? error.message : "Internal server error";
      return Response.json({ error: message }, { status: 500 });
    }
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachDbAuth],
  requestMiddleware: [csrfMiddleware, errorMiddleware],
}));
