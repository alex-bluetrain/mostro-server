import { User, type IUser, type IUserPreferences } from '../models/user.model';
import { nowUnix } from '@lib/unix-time';

export class UserRepository {
  async findByEmail(email: string): Promise<IUser | null> {
    return User.findOne({ email: email.toLowerCase() });
  }

  async findByTelegramId(telegramId: string): Promise<IUser | null> {
    return User.findOne({ telegramId });
  }

  async findByDiscordId(discordId: string): Promise<IUser | null> {
    return User.findOne({ discordId });
  }

  async upsertUser(user: Omit<IUser, 'telegramId' | 'discordId'>): Promise<IUser> {
    const email = user.email.toLowerCase();
    const result = await User.findOneAndUpdate(
      { email },
      { $setOnInsert: { ...user, email, addedAt: nowUnix() } },
      { upsert: true, new: true }
    );
    if (!result) throw new Error('Failed to upsert user');
    return result;
  }

  async linkTelegramId(email: string, telegramId: string): Promise<boolean> {
    const result = await User.updateOne(
      { email: email.toLowerCase() },
      { $set: { telegramId } }
    );
    return result.matchedCount > 0;
  }

  // Links a secondary channel to an existing identity. The unique sparse
  // index prevents claiming a discordId that's already taken: the duplicate comes out as
  // E11000 and the tool translates it, because the user types the id.
  async linkDiscordId(email: string, discordId: string): Promise<boolean> {
    const result = await User.updateOne(
      { email: email.toLowerCase() },
      { $set: { discordId } }
    );
    return result.matchedCount > 0;
  }

  // Redeem-time provisioning: creates the user on their first /start, or just
  // links telegram when the email already exists (legacy users, admin seed).
  async upsertFromInviteRedeem(email: string, telegramId: string, name: string): Promise<IUser> {
    const normalized = email.toLowerCase();
    const result = await User.findOneAndUpdate(
      { email: normalized },
      {
        $setOnInsert: {
          email: normalized,
          name,
          role: 'member' as const,
          addedAt: nowUnix(),
        },
        $set: { telegramId },
      },
      { upsert: true, new: true }
    );
    if (!result) throw new Error('Failed to upsert user from invite redeem');
    return result;
  }

  // Notification preferences: the opt-in lives on the user, so subscribing
  // creates nothing new, it just flips a flag on an already-invited identity.
  async setNotifications(email: string, enabled: boolean): Promise<boolean> {
    const result = await User.updateOne(
      { email: email.toLowerCase() },
      { $set: { 'preferences.notifications': enabled } }
    );
    return result.matchedCount > 0;
  }

  async updatePreferences(email: string, changes: Partial<IUserPreferences>): Promise<IUser | null> {
    const $set = Object.fromEntries(
      Object.entries(changes).map(([key, value]) => [`preferences.${key}`, value])
    );
    return User.findOneAndUpdate({ email: email.toLowerCase() }, { $set }, { new: true });
  }

  async listNotificationEmails(): Promise<string[]> {
    const docs = await User.find({ 'preferences.notifications': true }, { email: 1 }).lean();
    return docs.map(({ email }) => email);
  }

  async setUserName(email: string, name: string): Promise<boolean> {
    const result = await User.updateOne(
      { email: email.toLowerCase() },
      { $set: { name } }
    );
    return result.matchedCount > 0;
  }

  async ensureAdminSeed(adminEmail: string, adminName: string, adminTelegramId?: string): Promise<void> {
    const email = adminEmail.toLowerCase();
    await User.findOneAndUpdate(
      { email },
      {
        $setOnInsert: {
          email,
          name: adminName,
          role: 'admin' as const,
          addedAt: nowUnix(),
        },
        ...(adminTelegramId ? { $set: { telegramId: adminTelegramId } } : {}),
      },
      { upsert: true }
    );
  }
}

export const userRepository = new UserRepository();
