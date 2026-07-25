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
    showMissing: false,
    mode: 'quiz',
    learningDistrictIds: [],
    quizDistrictId: '',
    allowShortAnswers: false
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

test('createMatcher requires a street type and accepts typed abbreviations', () => {
    const matcher = core.createMatcher([
        {
            id: 'nikitskaya',
            name: 'Большая Никитская улица',
            aliases: ['ул. Большая Никитская'],
            kind: 'улица'
        },
        {
            id: 'bolotnaya-street',
            name: 'Болотная улица',
            aliases: [],
            kind: 'улица'
        },
        {
            id: 'bolotnaya-square',
            name: 'Болотная площадь',
            aliases: [],
            kind: 'площадь'
        },
        {
            id: 'krymsky-bridge',
            name: 'Крымский мост',
            aliases: [],
            kind: 'мост'
        }
    ]);

    assert.deepEqual(matcher.match('улица Большая Никитская'), {
        status: 'match',
        streetId: 'nikitskaya',
        normalizedValue: 'большая никитская улица'
    });
    assert.equal(matcher.match('большая никитская').status, 'incomplete');
    assert.equal(matcher.match('Большая Никитская ул.').streetId, 'nikitskaya');
    assert.equal(matcher.match('Болотная улица').streetId, 'bolotnaya-street');
    assert.equal(matcher.match('Болотная площадь').streetId, 'bolotnaya-square');

    assert.equal(matcher.match('Болотная').status, 'incomplete');
    assert.equal(matcher.match('Крымский').status, 'incomplete');
    assert.equal(matcher.match('Крымский мост').streetId, 'krymsky-bridge');
    assert.equal(matcher.match('неизвестная улица').status, 'unknown');
    assert.equal(matcher.match('   ').status, 'empty');
});

test('createMatcher optionally accepts exact untyped names without guessing partial input', () => {
    const matcher = core.createMatcher([
        {
            id: 'nikitskaya',
            name: 'Большая Никитская улица',
            aliases: ['ул. Большая Никитская'],
            kind: 'улица'
        },
        {
            id: 'bolotnaya-street',
            name: 'Болотная улица',
            aliases: [],
            kind: 'улица'
        },
        {
            id: 'bolotnaya-square',
            name: 'Болотная площадь',
            aliases: [],
            kind: 'площадь'
        },
        {
            id: 'krymsky-bridge',
            name: 'Крымский мост',
            aliases: [],
            kind: 'мост'
        },
        {
            id: 'kuznetsky-most-street',
            name: 'Кузнецкий Мост, улица',
            aliases: [],
            kind: 'улица'
        }
    ]);
    const shortAnswers = { allowTypeOmission: true };

    assert.deepEqual(matcher.match('Большая Никитская', shortAnswers), {
        status: 'match',
        streetId: 'nikitskaya',
        normalizedValue: 'большая никитская',
        typeOmitted: true
    });
    assert.deepEqual(matcher.match('Крымский', shortAnswers), {
        status: 'match',
        streetId: 'krymsky-bridge',
        normalizedValue: 'крымский',
        typeOmitted: true
    });
    assert.equal(
        matcher.match('Кузнецкий мост', shortAnswers).streetId,
        'kuznetsky-most-street'
    );
    assert.deepEqual(
        matcher.match('Болотная', shortAnswers).streetIds.sort(),
        ['bolotnaya-square', 'bolotnaya-street']
    );
    assert.equal(matcher.match('Большая', shortAnswers).status, 'incomplete');
    assert.equal(
        matcher.match('Болотная улица', shortAnswers).streetId,
        'bolotnaya-street'
    );
});

test('formatPercentage uses one decimal only when needed', () => {
    assert.equal(core.formatPercentage(0, 1098), '0%');
    assert.equal(core.formatPercentage(38, 1070), '3,6%');
    assert.equal(core.formatPercentage(57, 57), '100%');
    assert.equal(core.formatPercentage(1, 0), '0%');
});

test('inspectability follows quiz and learning mode rules', () => {
    assert.equal(core.isStreetInspectable('quiz', false, false, true, true), false);
    assert.equal(core.isStreetInspectable('quiz', false, true, false, true), true);
    assert.equal(core.isStreetInspectable('quiz', true, false, false, true), true);
    assert.equal(core.isStreetInspectable('quiz', true, true, true, false), false);
    assert.equal(core.isStreetInspectable('learning', false, false, true, false), true);
    assert.equal(core.isStreetInspectable('learning', true, true, false, true), false);
});

test('loadProgress rejects corrupt and incompatible saved state', async (t) => {
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

    await t.test('migrates schema 1 across a dataset update', () => {
        const storage = new MemoryStorage();
        storage.setItem(core.STORAGE_KEY, JSON.stringify({
            schemaVersion: 1,
            datasetVersion: 'dataset-v0',
            guessedIds: ['street-1']
        }));
        assert.deepEqual(
            core.loadProgress(storage, 'dataset-v1', validStreetIds),
            {
                guessedIds: ['street-1'],
                showMissing: false,
                mode: 'quiz',
                learningDistrictIds: [],
                quizDistrictId: '',
                allowShortAnswers: false
            }
        );
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
        schemaVersion: 2,
        datasetVersion: 'dataset-v1',
        guessedIds: ['street-2', 'deleted-street', 'street-1', 'street-2'],
        showMissing: true,
        mode: 'learning',
        learningDistrictIds: ['arbat', 'deleted-district', 'arbat']
    }));

    assert.deepEqual(
        core.loadProgress(
            storage,
            'dataset-v1',
            new Set(['street-1', 'street-2']),
            new Set(['arbat', 'basmanny'])
        ),
        {
            guessedIds: ['street-2', 'street-1'],
            showMissing: true,
            mode: 'learning',
            learningDistrictIds: ['arbat'],
            quizDistrictId: '',
            allowShortAnswers: false
        }
    );
});

test('loadProgress restores a valid quiz district from schema 3', () => {
    const storage = new MemoryStorage();
    storage.setItem(core.STORAGE_KEY, JSON.stringify({
        schemaVersion: 3,
        datasetVersion: 'dataset-v2',
        guessedIds: ['street-1'],
        showMissing: false,
        mode: 'quiz',
        learningDistrictIds: [],
        quizDistrictId: 'arbat'
    }));

    assert.deepEqual(
        core.loadProgress(
            storage,
            'dataset-v2',
            new Set(['street-1']),
            new Set(['arbat', 'basmanny'])
        ),
        {
            guessedIds: ['street-1'],
            showMissing: false,
            mode: 'quiz',
            learningDistrictIds: [],
            quizDistrictId: 'arbat',
            allowShortAnswers: false
        }
    );
});

test('loadProgress restores the short-answer option only from schema 4', () => {
    const storage = new MemoryStorage();
    storage.setItem(core.STORAGE_KEY, JSON.stringify({
        schemaVersion: 4,
        datasetVersion: 'dataset-v2',
        guessedIds: ['street-1'],
        showMissing: false,
        mode: 'quiz',
        learningDistrictIds: [],
        quizDistrictId: 'arbat',
        allowShortAnswers: true
    }));

    assert.equal(
        core.loadProgress(
            storage,
            'dataset-v2',
            new Set(['street-1']),
            new Set(['arbat'])
        ).allowShortAnswers,
        true
    );
});

test('saveProgress writes versioned state and clearProgress removes it', () => {
    const storage = new MemoryStorage();

    assert.equal(
        core.saveProgress(
            storage,
            'dataset-v2',
            new Set(['street-1', 'street-3']),
            true,
            'learning',
            new Set(['arbat', 'khamovniki']),
            'arbat',
            true
        ),
        true
    );

    const stored = JSON.parse(storage.getItem(core.STORAGE_KEY));
    assert.equal(stored.schemaVersion, 4);
    assert.equal(stored.datasetVersion, 'dataset-v2');
    assert.deepEqual(stored.guessedIds, ['street-1', 'street-3']);
    assert.equal(stored.showMissing, true);
    assert.equal(stored.mode, 'learning');
    assert.deepEqual(stored.learningDistrictIds, ['arbat', 'khamovniki']);
    assert.equal(stored.quizDistrictId, 'arbat');
    assert.equal(stored.allowShortAnswers, true);
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

    assert.equal(core.saveProgress(null, 'dataset-v1', [], false, 'quiz', []), false);
    assert.equal(core.clearProgress(null), false);
    assert.equal(core.saveProgress(storage, 'dataset-v1', [], false, 'quiz', []), false);
    assert.equal(core.clearProgress(storage), false);
});

test('streetMatchesDistrictSelection uses every intersected district', () => {
    const street = {
        districtIds: ['arbat', 'presnensky'],
        quizDistrictId: 'arbat'
    };

    assert.equal(core.streetMatchesDistrictSelection(street, new Set()), true);
    assert.equal(core.streetMatchesDistrictSelection(street, new Set(['arbat'])), true);
    assert.equal(core.streetMatchesDistrictSelection(street, new Set(['presnensky'])), true);
    assert.equal(core.streetMatchesDistrictSelection(street, new Set(['tverskoy'])), false);
    assert.equal(core.streetMatchesQuizDistrict(street, ''), true);
    assert.equal(core.streetMatchesQuizDistrict(street, 'arbat'), true);
    assert.equal(core.streetMatchesQuizDistrict(street, 'presnensky'), true);
    assert.equal(core.streetMatchesQuizDistrict(street, 'tverskoy'), false);
});
