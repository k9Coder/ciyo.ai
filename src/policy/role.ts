export type Role = "admin" | "user" | "unregistered";

export async function getRole(): Promise<Role> {
  const managed = await chrome.storage.managed
    .get(["orgToken", "adminToken"])
    .catch(() => ({})) as Record<string, unknown>;

  const local = await chrome.storage.local
    .get(["orgToken", "adminToken"]) as Record<string, unknown>;

  const orgToken = (managed["orgToken"] ?? local["orgToken"]) as string | undefined;
  const adminToken = (managed["adminToken"] ?? local["adminToken"]) as string | undefined;

  if (typeof adminToken === "string" && adminToken.startsWith("ps_adm_")) return "admin";
  if (typeof orgToken === "string" && orgToken.startsWith("ps_live_")) return "user";
  return "unregistered";
}
