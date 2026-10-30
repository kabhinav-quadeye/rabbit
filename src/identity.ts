export function loginEmail(value: string): string {
  const identifier = value.trim().toLowerCase();
  if (/^[a-z0-9][a-z0-9._-]{2,39}$/.test(identifier))
    return `${identifier}@rabbit.test`;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier) && identifier.length <= 254)
    return identifier;
  throw new Error("Enter a valid username or email address.");
}
