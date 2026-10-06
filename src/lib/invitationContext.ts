let invitationEmail: string | null = null;
export function consumeInvitationParameters(): void {
  const url = new URL(window.location.href);
  invitationEmail = url.searchParams.get("email")?.slice(0, 254) ?? null;
  if (!url.searchParams.has("email") && !url.searchParams.has("invite")) return;
  url.searchParams.delete("email");
  url.searchParams.delete("invite");
  window.history.replaceState(
    window.history.state,
    "",
    url.pathname + url.search + url.hash,
  );
}
export function getInvitationEmail(): string | null {
  return invitationEmail;
}
