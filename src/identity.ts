export function loginEmail(value: string): string {
  const identifier = value.trim().toLowerCase();
  if (/^[a-z0-9][a-z0-9._-]{2,39}$/.test(identifier))
    return `${identifier}@rabbit.test`;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier) && identifier.length <= 254)
    return identifier;
  throw new Error("Enter a valid username or email address.");
}

/** Validate every legacy handle before an administrator reserves any usernames. */
export function planUsernameClaims(users: { id: string; handle: string }[]) {
  const claimed = new Set<string>();
  return users.map((user) => {
    if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(user.handle))
      throw new Error(
        `Invalid legacy username ${user.handle} (${user.id}). Resolve it before migration.`,
      );
    if (claimed.has(user.handle))
      throw new Error(
        `Duplicate legacy username ${user.handle}. Resolve it before migration.`,
      );
    claimed.add(user.handle);
    return { handle: user.handle, userId: user.id };
  });
}
