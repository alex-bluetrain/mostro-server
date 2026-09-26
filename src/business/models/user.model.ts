import { Schema, model } from 'mongoose';

// Preferences are embedded in the user, not a separate collection: they are
// attributes of the person, not entities with their own lifecycle. One document
// per identity avoids joins and drift.
export interface IUserPreferences {
  notifications: boolean;
}

export interface IUser {
  email: string;
  name: string;
  role: 'admin' | 'member';
  telegramId?: string;
  // Optional secondary channel, linked from Telegram via linkDiscordTool.
  // Sign-up and notifications still go through telegramId.
  discordId?: string;
  addedAt: number;
  preferences: IUserPreferences;
}

const userPreferencesSchema = new Schema<IUserPreferences>(
  {
    notifications: { type: Boolean, default: false },
  },
  { _id: false }
);

const userSchema = new Schema<IUser>({
  email: { type: String, required: true, unique: true, lowercase: true },
  name: { type: String, default: '' },
  role: { type: String, enum: ['admin', 'member'], required: true },
  telegramId: { type: String, unique: true, sparse: true },
  discordId: { type: String, unique: true, sparse: true },
  addedAt: { type: Number, required: true },
  preferences: { type: userPreferencesSchema, default: () => ({}) },
});

export const User = model<IUser>('User', userSchema);
