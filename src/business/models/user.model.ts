import { Schema, model } from 'mongoose';

// Preferences are embedded in the user, not a separate collection: they are
// attributes of the person, not entities with their own lifecycle. One document
// per identity avoids joins and drift.
export const LANGUAGES = ['en', 'es'] as const;
export const THEMES = ['system', 'light', 'dark'] as const;

// language/theme stay unset until the user picks one, so the app keeps
// following the device until then.
export interface IUserPreferences {
  notifications: boolean;
  language?: (typeof LANGUAGES)[number];
  theme?: (typeof THEMES)[number];
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
    language: { type: String, enum: LANGUAGES },
    theme: { type: String, enum: THEMES },
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
