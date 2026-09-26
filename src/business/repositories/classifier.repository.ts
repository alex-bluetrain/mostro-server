import { Classifier } from '../models/classifier.model';
import { ClassifierSnapshot, type ClassifierDomain, type IClassifierSnapshot } from '../models/classifier-snapshot.model';
import type { ClassificationRules } from '@lib/mail-classifier/classification-rules.type';

export class ClassifierRepository {
  // Reads the pointer (classifiers) and returns the active snapshot's rules. Called on
  // every poll run: no cache, the source of truth is always Mongo.
  //
  // Returns null if the domain has no rules configured yet: that's an expected
  // state (nobody loaded them yet) and the poll handles it by skipping the run. On the other hand,
  // a pointer to a missing snapshot does throw: that's data corruption,
  // not missing config, and hiding it would make mails get processed wrong silently.
  async findActiveRules(domain: ClassifierDomain): Promise<ClassificationRules | null> {
    const pointer = await Classifier.findOne({ domain }).lean();
    if (!pointer) return null;

    const snapshot = await ClassifierSnapshot.findOne({ domain, version: pointer.version }).lean();
    if (!snapshot) {
      throw new Error(`[classifier] el puntero de "${domain}" apunta a la versión ${pointer.version} pero no existe ese snapshot`);
    }

    return snapshot.classification_rules;
  }

  // Checks the pointer exists without fetching the snapshot: the boot bootstrap uses it
  // to decide whether to seed the domain or leave it alone.
  async hasActivePointer(domain: ClassifierDomain): Promise<boolean> {
    return (await Classifier.exists({ domain })) !== null;
  }

  // Active version per domain. The admin screen needs to mark which one is in use
  // without fetching every snapshot's rules.
  async listActiveVersions(): Promise<Record<string, number>> {
    const pointers = await Classifier.find().lean();
    return Object.fromEntries(pointers.map(p => [p.domain, p.version]));
  }

  // Metadata for a domain's versions, newest first. Without the rules:
  // they're heavy and the list only shows the history.
  async listSnapshots(domain: ClassifierDomain): Promise<Omit<IClassifierSnapshot, 'classification_rules'>[]> {
    return ClassifierSnapshot.find({ domain })
      .select('-classification_rules')
      .sort({ version: -1 })
      .lean<Omit<IClassifierSnapshot, 'classification_rules'>[]>();
  }

  async findSnapshot(domain: ClassifierDomain, version: number): Promise<IClassifierSnapshot | null> {
    return ClassifierSnapshot.findOne({ domain, version }).lean<IClassifierSnapshot | null>();
  }

  // Rollback / roll-forward: move the pointer to an existing version. Returns
  // false if the snapshot doesn't exist, so the caller answers 404 instead of leaving
  // the pointer pointing at nothing.
  async activateVersion(domain: ClassifierDomain, version: number): Promise<boolean> {
    const exists = await ClassifierSnapshot.exists({ domain, version });
    if (!exists) return false;

    await Classifier.updateOne({ domain }, { $set: { version } }, { upsert: true });
    return true;
  }

  // Inserts a new snapshot (version = max + 1) and moves the pointer. Snapshots are
  // immutable: publishing changes always creates a new version.
  async publishSnapshot(input: {
    domain: ClassifierDomain;
    author: string;
    changelog: string;
    rules: ClassificationRules;
  }): Promise<number> {
    const { domain, author, changelog, rules } = input;
    const latest = await ClassifierSnapshot.findOne({ domain }).sort({ version: -1 }).lean();
    const version = (latest?.version ?? 0) + 1;

    await ClassifierSnapshot.create({ domain, version, author, changelog, classification_rules: rules });
    await Classifier.updateOne({ domain }, { $set: { version } }, { upsert: true });

    return version;
  }
}

export const classifierRepository = new ClassifierRepository();
