type JwtUserPayload = {
  id?: number;
  userId?: number;
  actualUserId?: number;
  username?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  roleName?: string;
  role?: string;
};

function decodeBase64Url(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  if (typeof globalThis.atob === 'function') {
    return globalThis.atob(padded);
  }
  throw new Error('Base64 decode is unavailable.');
}

export function parseJwtUser(token: string): JwtUserPayload | null {
  try {
    const segment = token.split('.')[1];
    if (!segment) return null;
    const payload = JSON.parse(decodeBase64Url(segment));
    const user = payload?.user;
    return user && typeof user === 'object' ? user : null;
  } catch {
    return null;
  }
}

export function mapJwtUserToAuthUser(user: JwtUserPayload | null) {
  if (!user) return null;
  const id = Number(user.id ?? user.userId ?? user.actualUserId);
  if (!Number.isFinite(id)) return null;
  return {
    id,
    username: user.username,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    roleName: user.roleName ?? user.role,
  };
}
