/**
 * Parse JWT payload from localStorage token (no verification; for role/type only).
 */
export function getStoredUser() {
  const token = localStorage.getItem('token');
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

export function isAdmin() {
  const user = getStoredUser();
  return user && user.role === 'ADMIN';
}
