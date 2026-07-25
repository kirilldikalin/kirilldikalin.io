'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

require('../quiz-core.js');

const core = globalThis.MoscowStreetQuizCore;

class MemoryStorage {
    constructor() {
        this.values = new Map();
    }

    getItem(key) {
        return this.values.has(key) ? this.values.get(key) : null;
    }

    setItem(key, value) {
        this.values.set(key, String(value));
    }

    removeItem(key) {
        this.values.delete(key);
    }
}

const emptyProgress = {
    guessedIds: [],
    showMissing: false
};

test('normalizeAnswer normalizes Russian street names and common abbreviations', () => {
    assert.equal(core.normalizeAnswer('  УЛ. Большая-Дмитровка  '), 'большая дмитровка улица');
    assert.equal(core.normalizeAnswer('наб. Тараса Шевченко'), 'тараса шевченко набережная');
    assert.equal(core.normalizeAnswer('Ёлочный пер.'), 'елочный переулок');
    assert.equal(core.normalizeAnswer('«Садовая—Триумфальная» улица'), 'садовая триумфальная улица');
    assert.equal(core.normalizeAnswer('Б-р Энтузиастов'), 'энтузиастов бульвар');
    assert.equal(core.normalizeAnswer('Пр-д Шокальского'), 'шокальского проезд');
    assert.equal(core.normalizeAnswer(''), '');
    assert.equal(core.normalizeAnswer(null), '');
});

test('createMatcher accepts unique aliases and reports ambiguous type-free aliases', () => {
    const matcher = core.createMatcher([
        {
            id: 'nikitskaya',
            name: 'Большая Никитская улица',
            aliases: ['ул. Большая Никитская', 'Большая Никитская']
        },
        {
            id: 'bolotnaya-street',
            name: 'Болотная улица',
            aliases: []
        },
        {
            id: 'bolotnaya-square',
            name: 'Болотная площадь',
            aliases: []
        }
    ]);

    assert.deepEqual(matcher.match('улица Большая Никитская'), {
        status: 'match',
        streetId: 'nikitskaya',
        normalizedValue: 'большая никитская улица'
    });
    assert.equal(matcher.match('большая никитская').streetId, 'nikitskaya');
    assert.equal(matcher.match('Болотная улица').streetId, 'bolotnaya-street');
    assert.equal(matcher.match('Болотная площадь').streetId, 'bolotnaya-square');

    const ambiguous = matcher.match('Болотная');
    assert.equal(ambiguous.status, 'ambiguous');
    assert.deepEqual(
        ambiguous.streetIds.slice().sort(),
        ['bolotnaya-square', 'bolotnaya-street']
    );
    assert.equal(matcher.match('неизвестная улица').status, 'unknown');
    assert.equal(matcher.match('   ').status, 'empty');
});

test('loadProgress rejects corrupt, incompatible and stale saved state', async (t) => {
    const validStreetIds = new Set(['street-1', 'street-2']);

    await t.test('without storage', () => {
        assert.deepEqual(core.loadProgress(null, 'dataset-v1', validStreetIds), emptyProgress);
    });

    await t.test('with invalid JSON', () => {
        const storage = new MemoryStorage();
        storage.setItem(core.STORAGE_KEY, '{broken');
        assert.deepEqual(core.loadProgress(storage, 'dataset-v1', validStreetIds), emptyProgress);
    });

    await t.test('with another storage schema', () => {
        const storage = new MemoryStorage();
        storage.setItem(core.STORAGE_KEY, JSON.stringify({
            schemaVersion: 999,
            datasetVersion: 'dataset-v1',
            guessedIds: ['street-1']
        }));
        assert.deepEqual(core.loadProgress(storage, 'dataset-v1', validStreetIds), emptyProgress);
    });

    await t.test('with another dataset version', () => {
        const storage = new MemoryStorage();
        storage.setItem(core.STORAGE_KEY, JSON.stringify({
            schemaVersion: 1,
            datasetVersion: 'dataset-v0',
            guessedIds: ['street-1']
        }));
        assert.deepEqual(core.loadProgress(storage, 'dataset-v1', validStreetIds), emptyProgress);
    });

    await t.test('with a non-array list of guesses', () => {
        const storage = new MemoryStorage();
        storage.setItem(core.STORAGE_KEY, JSON.stringify({
            schemaVersion: 1,
            datasetVersion: 'dataset-v1',
            guessedIds: 'street-1'
        }));
        assert.deepEqual(core.loadProgress(storage, 'dataset-v1', validStreetIds), emptyProgress);
    });

    await t.test('when storage access throws', () => {
        const storage = {
            getItem() {
                throw new Error('storage is unavailable');
            }
        };
        assert.deepEqual(core.loadProgress(storage, 'dataset-v1', validStreetIds), emptyProgress);
    });
});

test('loadProgress restores only unique street IDs from the current dataset', () => {
    const storage = new MemoryStorage();
    storage.setItem(core.STORAGE_KEY, JSON.stringify({
        schemaVersion: 1,
        datasetVersion: 'dataset-v1',
        guessedIds: ['street-2', 'deleted-street', 'street-1', 'street-2'],
        showMissing: true
    }));

    assert.deepEqual(
        core.loadProgress(storage, 'dataset-v1', new Set(['street-1', 'street-2'])),
        {
            guessedIds: ['street-2', 'street-1'],
            showMissing: true
        }
    );
});

test('saveProgress writes versioned state and clearProgress removes it', () => {
    const storage = new MemoryStorage();

    assert.equal(
        core.saveProgress(
            storage,
            'dataset-v2',
            new Set(['street-1', 'street-3']),
            true
        ),
        true
    );

    const stored = JSON.parse(storage.getItem(core.STORAGE_KEY));
    assert.equal(stored.schemaVersion, 1);
    assert.equal(stored.datasetVersion, 'dataset-v2');
    assert.deepEqual(stored.guessedIds, ['street-1', 'street-3']);
    assert.equal(stored.showMissing, true);
    assert.equal(Number.isNaN(Date.parse(stored.updatedAt)), false);

    assert.equal(core.clearProgress(storage), true);
    assert.equal(storage.getItem(core.STORAGE_KEY), null);
});

test('saveProgress and clearProgress handle unavailable storage', () => {
    const storage = {
        setItem() {
            throw new Error('write failed');
        },
        removeItem() {
            throw new Error('delete failed');
        }
    };

    assert.equal(core.saveProgress(null, 'dataset-v1', [], false), false);
    assert.equal(core.clearProgress(null), false);
    assert.equal(core.saveProgress(storage, 'dataset-v1', [], false), false);
    assert.equal(core.clearProgress(storage), false);
});
