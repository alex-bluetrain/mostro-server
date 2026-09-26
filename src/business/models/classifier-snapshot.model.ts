import { Schema, model } from 'mongoose';
import type { ClassificationRules } from '@lib/mail-classifier/classification-rules.type';

export const CLASSIFIER_DOMAINS = ['diapers', 'meds', 'refunds'] as const;

export type ClassifierDomain = (typeof CLASSIFIER_DOMAINS)[number];

// Immutable, versioned snapshot of a domain's classification rules.
// Never edited or deleted: publishing changes = inserting a new version and
// moving the pointer (see classifier.model.ts).
export interface IClassifierSnapshot {
  domain: ClassifierDomain;
  version: number;
  author: string;
  changelog: string;
  classification_rules: ClassificationRules;
}

const classifierSnapshotSchema = new Schema<IClassifierSnapshot>({
  domain: { type: String, enum: CLASSIFIER_DOMAINS, required: true },
  version: { type: Number, required: true },
  author: { type: String, required: true },
  changelog: { type: String, required: true },
  classification_rules: { type: Schema.Types.Mixed, required: true },
});

classifierSnapshotSchema.index({ domain: 1, version: 1 }, { unique: true });

export const ClassifierSnapshot = model<IClassifierSnapshot>(
  'ClassifierSnapshot',
  classifierSnapshotSchema,
  'classifier-snapshots',
);
