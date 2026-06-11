import { userFromBearerToken } from "@/lib/auth-token.server";
import { assertContentManager } from "@/lib/content-manager.server";

/** Verify Bearer token + trainer/admin role for asset routes. */
export async function userFromAssetRequest(request: Request) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new Error("Unauthorized");
  }
  const token = header.slice("Bearer ".length).trim();
  if (!token) throw new Error("Unauthorized");
  const user = await userFromBearerToken(token);
  await assertContentManager(user.id);
  return user;
}
