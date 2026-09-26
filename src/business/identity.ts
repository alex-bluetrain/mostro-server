import { userRepository } from './repositories';
import type { IUser } from './models/user.model';

// Every canonical resourceId is the user's email (resolveResourceId
// guarantees it when creating threads). An id without '@' isn't an email: returns null and
// the tools report it as an unknown user.
export function emailFromResourceId(resourceId: string): string | null {
  const base = resourceId.trim().toLowerCase();
  return base.includes('@') ? base : null;
}

export async function getUserByResourceId(resourceId: string): Promise<IUser | null> {
  const email = emailFromResourceId(resourceId);
  if (!email) return null;
  return userRepository.findByEmail(email);
}

export async function setUserNameByResourceId(resourceId: string, name: string): Promise<boolean> {
  const email = emailFromResourceId(resourceId);
  if (!email) return false;
  return userRepository.setUserName(email, name);
}
