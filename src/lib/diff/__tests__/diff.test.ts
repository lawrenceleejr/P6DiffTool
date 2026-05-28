import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { XER } from 'xer-parser';
import { diffXer } from '../index';

function loadFixtures(): { oldXer: XER; newXer: XER } {
  const root = resolve(__dirname, '../../../..');
  const oldText = readFileSync(resolve(root, 'test-data/sample-baseline.xer'), 'utf8');
  const newText = readFileSync(resolve(root, 'test-data/sample-revised.xer'), 'utf8');
  return { oldXer: new XER(oldText), newXer: new XER(newText) };
}

describe('diffXer — activities', () => {
  const { oldXer, newXer } = loadFixtures();
  const result = diffXer(oldXer, newXer);

  it('classifies A1015 (Design HVAC) as added', () => {
    const row = result.activities.rows.find(r => r.key === 'A1015');
    expect(row).toBeDefined();
    expect(row!.status).toBe('added');
    expect(row!.new?.name).toBe('Design HVAC');
  });

  it('classifies A2020 (Install Roof) as removed', () => {
    const row = result.activities.rows.find(r => r.key === 'A2020');
    expect(row).toBeDefined();
    expect(row!.status).toBe('removed');
    expect(row!.old?.name).toBe('Install Roof');
  });

  it('classifies A1010 as modified with a duration change 40 -> 48', () => {
    const row = result.activities.rows.find(r => r.key === 'A1010');
    expect(row).toBeDefined();
    expect(row!.status).toBe('modified');
    const dur = row!.fields.find(f => f.field === 'originalDurationHrs');
    expect(dur).toBeDefined();
    expect(dur!.oldValue).toBe(40);
    expect(dur!.newValue).toBe(48);
  });

  it('classifies A2000 as modified with a name change and a planned-start shift', () => {
    const row = result.activities.rows.find(r => r.key === 'A2000');
    expect(row).toBeDefined();
    expect(row!.status).toBe('modified');
    const fields = Object.fromEntries(row!.fields.map(f => [f.field, f]));
    expect(fields.name?.oldValue).toBe('Pour Foundation');
    expect(fields.name?.newValue).toBe('Pour Foundation (Slab)');
    expect(fields.targetStart?.oldValue).toContain('2026-04-15');
    expect(fields.targetStart?.newValue).toContain('2026-04-20');
  });

  it('classifies A3000 as modified with status going Not Started -> Active', () => {
    const row = result.activities.rows.find(r => r.key === 'A3000');
    expect(row).toBeDefined();
    expect(row!.status).toBe('modified');
    const status = row!.fields.find(f => f.field === 'status');
    expect(status?.oldValue).toBe('TK_NotStart');
    expect(status?.newValue).toBe('TK_Active');
  });

  it('classifies untouched activities (A1000, A1020, A2010, A3010) as unchanged', () => {
    for (const code of ['A1000', 'A1020', 'A2010', 'A3010']) {
      const row = result.activities.rows.find(r => r.key === code);
      expect(row, `expected ${code} present`).toBeDefined();
      expect(row!.status, `expected ${code} unchanged`).toBe('unchanged');
    }
  });

  it('reports the expected counts (1 added, 1 removed, 3 modified, 4 unchanged)', () => {
    const { added, removed, modified, unchanged } = result.activities.counts;
    expect({ added, removed, modified, unchanged }).toEqual({
      added: 1, removed: 1, modified: 3, unchanged: 4
    });
  });
});

describe('diffXer — relationships', () => {
  const { oldXer, newXer } = loadFixtures();
  const result = diffXer(oldXer, newXer);

  it('classifies the 8 hr lag added on A1010 -> A1020 as modified', () => {
    const row = result.relationships.rows.find(r => r.key.startsWith('A1010->A1020'));
    expect(row).toBeDefined();
    expect(row!.status).toBe('modified');
    const lag = row!.fields.find(f => f.field === 'lagHrs');
    expect(lag?.oldValue).toBe(0);
    expect(lag?.newValue).toBe(8);
  });

  it('classifies A1015 -> A2000 and A2010 -> A3000 as added', () => {
    const a1015 = result.relationships.rows.find(r => r.key.startsWith('A1015->A2000'));
    const a2010 = result.relationships.rows.find(r => r.key.startsWith('A2010->A3000'));
    expect(a1015?.status).toBe('added');
    expect(a2010?.status).toBe('added');
  });

  it('classifies relationships touching the removed A2020 as removed', () => {
    const removed = result.relationships.rows.filter(r => r.status === 'removed');
    const keys = removed.map(r => r.key);
    expect(keys.some(k => k.includes('A2010->A2020'))).toBe(true);
    expect(keys.some(k => k.includes('A2020->A3000'))).toBe(true);
  });

  it('reports the expected counts (2 added, 2 removed, 1 modified, 4 unchanged)', () => {
    const { added, removed, modified, unchanged } = result.relationships.counts;
    expect({ added, removed, modified, unchanged }).toEqual({
      added: 2, removed: 2, modified: 1, unchanged: 4
    });
  });
});

describe('diffXer — project', () => {
  const { oldXer, newXer } = loadFixtures();
  const result = diffXer(oldXer, newXer);

  it('classifies the project as modified with a data-date shift', () => {
    const row = result.project.rows.find(r => r.key === 'P1');
    expect(row).toBeDefined();
    expect(row!.status).toBe('modified');
    const dd = row!.fields.find(f => f.field === 'dataDate');
    expect(dd?.oldValue).toContain('2026-04-01');
    expect(dd?.newValue).toContain('2026-04-15');
  });
});

describe('diffXer — project short name is ignored for matching', () => {
  const { oldXer } = loadFixtures();
  const baseText = readFileSync(resolve(__dirname, '../../../..', 'test-data/sample-baseline.xer'), 'utf8');
  // Rename the project everywhere (PROJECT.proj_short_name and the
  // PROJWBS root node's wbs_short_name). Everything else is byte-identical.
  const renamedText = baseText.replace(/\tP1\t/g, '\tP1_RENAMED\t');
  const renamed = new XER(renamedText);
  const result = diffXer(oldXer, renamed);

  it('reports zero activity changes despite the project rename', () => {
    expect(result.activities.counts.added).toBe(0);
    expect(result.activities.counts.removed).toBe(0);
    expect(result.activities.counts.modified).toBe(0);
  });

  it('reports zero relationship changes despite the project rename', () => {
    expect(result.relationships.counts.added).toBe(0);
    expect(result.relationships.counts.removed).toBe(0);
    expect(result.relationships.counts.modified).toBe(0);
  });

  it('does not include the project-root WBS node in the WBS diff', () => {
    expect(result.wbs.counts.added).toBe(0);
    expect(result.wbs.counts.removed).toBe(0);
    expect(result.wbs.counts.modified).toBe(0);
    for (const r of result.wbs.rows) {
      expect((r.new ?? r.old)?.shortName).not.toBe('P1');
      expect((r.new ?? r.old)?.shortName).not.toBe('P1_RENAMED');
    }
  });
});

describe('diffXer — wbs, resources, calendars', () => {
  const { oldXer, newXer } = loadFixtures();
  const result = diffXer(oldXer, newXer);

  it('shows WBS unchanged across the two files', () => {
    expect(result.wbs.counts.added).toBe(0);
    expect(result.wbs.counts.removed).toBe(0);
    expect(result.wbs.counts.modified).toBe(0);
    expect(result.wbs.counts.unchanged).toBeGreaterThan(0);
  });

  it('shows resources unchanged', () => {
    expect(result.resources.counts.added).toBe(0);
    expect(result.resources.counts.removed).toBe(0);
    expect(result.resources.counts.modified).toBe(0);
  });

  it('shows calendars unchanged', () => {
    expect(result.calendars.counts.added).toBe(0);
    expect(result.calendars.counts.removed).toBe(0);
    expect(result.calendars.counts.modified).toBe(0);
  });
});
