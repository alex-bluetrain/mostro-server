import { describe, it, expect, beforeEach, vi } from 'vitest';
import { classifierRepository } from './classifier.repository';
import { Classifier } from '../models/classifier.model';
import { ClassifierSnapshot } from '../models/classifier-snapshot.model';
import type { ClassificationRules } from '@lib/mail-classifier/classification-rules.type';

vi.mock('../models/classifier.model');
vi.mock('../models/classifier-snapshot.model');

const rules: ClassificationRules = {
  outcomes: [{ label: 'diapers.confirmed', condition: 'confirma el pedido' }],
  'default-outcome': { label: 'diapers.unknown' },
};

describe('ClassifierRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findActiveRules', () => {
    it('returns the rules of the snapshot the pointer points at', async () => {
      vi.mocked(Classifier.findOne).mockReturnValue({ lean: () => Promise.resolve({ domain: 'diapers', version: 3 }) } as any);
      vi.mocked(ClassifierSnapshot.findOne).mockReturnValue({ lean: () => Promise.resolve({ classification_rules: rules }) } as any);

      const result = await classifierRepository.findActiveRules('diapers');

      expect(result).toEqual(rules);
      expect(ClassifierSnapshot.findOne).toHaveBeenCalledWith({ domain: 'diapers', version: 3 });
    });

    it('returns null if the domain has no rules configured yet', async () => {
      vi.mocked(Classifier.findOne).mockReturnValue({ lean: () => Promise.resolve(null) } as any);

      await expect(classifierRepository.findActiveRules('meds')).resolves.toBeNull();
    });

    it('fails clearly if the pointer points at a missing snapshot', async () => {
      vi.mocked(Classifier.findOne).mockReturnValue({ lean: () => Promise.resolve({ domain: 'refunds', version: 9 }) } as any);
      vi.mocked(ClassifierSnapshot.findOne).mockReturnValue({ lean: () => Promise.resolve(null) } as any);

      await expect(classifierRepository.findActiveRules('refunds')).rejects.toThrow(/versión 9.*no existe/);
    });
  });

  describe('publishSnapshot', () => {
    it('auto-increments the version and moves the pointer', async () => {
      vi.mocked(ClassifierSnapshot.findOne).mockReturnValue({
        sort: () => ({ lean: () => Promise.resolve({ version: 2 }) }),
      } as any);
      vi.mocked(ClassifierSnapshot.create).mockResolvedValue({} as any);
      vi.mocked(Classifier.updateOne).mockResolvedValue({} as any);

      const version = await classifierRepository.publishSnapshot({
        domain: 'diapers', author: 'Alex', changelog: 'seed', rules,
      });

      expect(version).toBe(3);
      expect(ClassifierSnapshot.create).toHaveBeenCalledWith({
        domain: 'diapers', version: 3, author: 'Alex', changelog: 'seed', classification_rules: rules,
      });
      expect(Classifier.updateOne).toHaveBeenCalledWith({ domain: 'diapers' }, { $set: { version: 3 } }, { upsert: true });
    });

    it('starts at version 1 when there are no previous snapshots', async () => {
      vi.mocked(ClassifierSnapshot.findOne).mockReturnValue({
        sort: () => ({ lean: () => Promise.resolve(null) }),
      } as any);
      vi.mocked(ClassifierSnapshot.create).mockResolvedValue({} as any);
      vi.mocked(Classifier.updateOne).mockResolvedValue({} as any);

      const version = await classifierRepository.publishSnapshot({
        domain: 'meds', author: 'Alex', changelog: 'seed inicial', rules,
      });

      expect(version).toBe(1);
    });
  });
});
