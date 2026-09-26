import { Schema, model } from 'mongoose';
import type { ClassifierDomain } from './classifier-snapshot.model';

// Mutable pointer: which classifier-snapshots version is active per domain.
// Rollback = point at an older version.
export interface IClassifier {
  domain: ClassifierDomain;
  version: number;
}

const classifierSchema = new Schema<IClassifier>({
  domain: { type: String, enum: ['diapers', 'meds', 'refunds'], required: true, unique: true },
  version: { type: Number, required: true },
});

export const Classifier = model<IClassifier>('Classifier', classifierSchema, 'classifiers');
