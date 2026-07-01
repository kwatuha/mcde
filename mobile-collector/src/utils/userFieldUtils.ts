import { AuthUser } from '../services/api';

export interface UserFieldAnswer {
  userId: number;
  displayName: string;
  email?: string;
  roleName?: string;
  username?: string;
}

export function buildUserDisplayName(user: AuthUser | null | undefined): string {
  if (!user) return '';
  const first = String(user.firstName || '').trim();
  const last = String(user.lastName || '').trim();
  const full = `${first} ${last}`.trim();
  if (full) return full;
  if (user.username) return user.username;
  if (user.email) return user.email;
  return '';
}

export function buildUserFieldAnswer(user: AuthUser | null | undefined): UserFieldAnswer | null {
  if (!user?.id) return null;
  const displayName = buildUserDisplayName(user);
  return {
    userId: user.id,
    displayName: displayName || `User #${user.id}`,
    email: user.email,
    roleName: user.roleName,
    username: user.username,
  };
}

export function formatUserFieldDisplay(value: unknown): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const v = value as UserFieldAnswer;
    return v.displayName || v.username || v.email || (v.userId != null ? `User #${v.userId}` : '—');
  }
  return String(value);
}
