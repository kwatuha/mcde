export function buildUserDisplayName(user) {
  if (!user) return '';
  const first = String(user.firstName || '').trim();
  const last = String(user.lastName || '').trim();
  const full = `${first} ${last}`.trim();
  if (full) return full;
  if (user.username) return user.username;
  if (user.email) return user.email;
  return '';
}

export function buildUserFieldAnswer(user) {
  const userId = Number(user?.id ?? user?.userId);
  if (!user || !Number.isFinite(userId) || userId <= 0) return null;
  const displayName = buildUserDisplayName(user);
  return {
    userId,
    displayName: displayName || `User #${userId}`,
    email: user.email,
    roleName: user.roleName || user.role,
    username: user.username,
  };
}

export function isUserFieldEmpty(value) {
  if (value == null || value === '') return true;
  if (typeof value === 'string') return value.trim() === '';
  if (typeof value === 'object') {
    const userId = value.userId ?? value.id;
    const name = String(value.displayName || value.username || value.email || '').trim();
    return !name && (userId == null || !Number.isFinite(Number(userId)) || Number(userId) <= 0);
  }
  return false;
}
