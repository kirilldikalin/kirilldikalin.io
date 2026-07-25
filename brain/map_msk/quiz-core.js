(function (root) {
    'use strict';

    var STORAGE_KEY = 'kirilldikalin.map_msk.progress';
    var STORAGE_SCHEMA_VERSION = 1;

    var TYPE_FORMS = {
        'ал': 'аллея',
        'аллея': 'аллея',
        'бульв': 'бульвар',
        'бульвар': 'бульвар',
        'линия': 'линия',
        'мост': 'мост',
        'наб': 'набережная',
        'набережная': 'набережная',
        'пер': 'переулок',
        'переулок': 'переулок',
        'пл': 'площадь',
        'площадь': 'площадь',
        'прд': 'проезд',
        'проезд': 'проезд',
        'просек': 'просек',
        'просп': 'проспект',
        'проспект': 'проспект',
        'путепровод': 'путепровод',
        'спуск': 'спуск',
        'тоннель': 'тоннель',
        'тракт': 'тракт',
        'туп': 'тупик',
        'тупик': 'тупик',
        'ул': 'улица',
        'улица': 'улица',
        'эстакада': 'эстакада',
        'ш': 'шоссе',
        'шоссе': 'шоссе'
    };

    var STREET_TYPES = Object.keys(TYPE_FORMS).reduce(function (types, form) {
        types[TYPE_FORMS[form]] = true;
        return types;
    }, {});

    function normalizeAnswer(value) {
        if (typeof value !== 'string') {
            return '';
        }

        var text = value
            .normalize('NFKC')
            .toLocaleLowerCase('ru-RU')
            .replace(/ё/g, 'е')
            .replace(/[‐‑‒–—−-]/g, ' ')
            .replace(/[«»„“”"'`´]/g, ' ')
            .replace(/[.,;:!?()[\]{}\\/|№]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (!text) {
            return '';
        }

        var rawTokens = text.split(' ');
        var tokens = [];

        for (var index = 0; index < rawTokens.length; index += 1) {
            var token = rawTokens[index];
            var nextToken = rawTokens[index + 1];

            if (token === 'б' && nextToken === 'р') {
                tokens.push('бульвар');
                index += 1;
                continue;
            }

            if (token === 'пр' && nextToken === 'д') {
                tokens.push('проезд');
                index += 1;
                continue;
            }

            tokens.push(TYPE_FORMS[token] || token);
        }

        if (tokens.length > 1 && STREET_TYPES[tokens[0]]) {
            var streetType = tokens.shift();
            if (tokens[tokens.length - 1] !== streetType) {
                tokens.push(streetType);
            }
        }

        return tokens.join(' ');
    }

    function withoutStreetType(normalizedValue) {
        if (!normalizedValue) {
            return '';
        }

        var tokens = normalizedValue.split(' ');
        if (tokens.length > 1 && STREET_TYPES[tokens[tokens.length - 1]]) {
            tokens.pop();
        }
        return tokens.join(' ');
    }

    function addOwner(owners, alias, streetId) {
        if (!alias) {
            return;
        }

        if (!owners.has(alias)) {
            owners.set(alias, new Set());
        }
        owners.get(alias).add(streetId);
    }

    function createMatcher(streets) {
        var owners = new Map();
        var derivedAliases = [];

        streets.forEach(function (street) {
            var rawAliases = [street.name].concat(
                Array.isArray(street.aliases) ? street.aliases : []
            );

            rawAliases.forEach(function (rawAlias) {
                var normalizedAlias = normalizeAnswer(rawAlias);
                if (!normalizedAlias) {
                    return;
                }

                addOwner(owners, normalizedAlias, street.id);

                var shortAlias = withoutStreetType(normalizedAlias);
                if (shortAlias && shortAlias !== normalizedAlias) {
                    derivedAliases.push({
                        alias: shortAlias,
                        streetId: street.id
                    });
                }
            });
        });

        derivedAliases.forEach(function (candidate) {
            addOwner(owners, candidate.alias, candidate.streetId);
        });

        var index = new Map();
        var conflicts = new Map();

        owners.forEach(function (streetIds, alias) {
            if (streetIds.size === 1) {
                index.set(alias, streetIds.values().next().value);
            } else {
                conflicts.set(alias, Array.from(streetIds));
            }
        });

        return {
            match: function (value) {
                var normalizedValue = normalizeAnswer(value);

                if (!normalizedValue) {
                    return {
                        status: 'empty',
                        normalizedValue: ''
                    };
                }

                if (index.has(normalizedValue)) {
                    return {
                        status: 'match',
                        streetId: index.get(normalizedValue),
                        normalizedValue: normalizedValue
                    };
                }

                if (conflicts.has(normalizedValue)) {
                    return {
                        status: 'ambiguous',
                        streetIds: conflicts.get(normalizedValue).slice(),
                        normalizedValue: normalizedValue
                    };
                }

                return {
                    status: 'unknown',
                    normalizedValue: normalizedValue
                };
            },
            aliasCount: index.size,
            conflicts: conflicts
        };
    }

    function getDatasetVersion(meta, fallback) {
        var source = meta || {};
        var version = source.datasetVersion ||
            source.version ||
            source.generatedAt ||
            source.generated_at ||
            fallback ||
            'unknown';

        return String(version);
    }

    function loadProgress(storage, datasetVersion, validStreetIds) {
        var emptyProgress = {
            guessedIds: [],
            showMissing: false
        };

        if (!storage) {
            return emptyProgress;
        }

        try {
            var rawValue = storage.getItem(STORAGE_KEY);
            if (!rawValue) {
                return emptyProgress;
            }

            var stored = JSON.parse(rawValue);
            if (
                stored.schemaVersion !== STORAGE_SCHEMA_VERSION ||
                stored.datasetVersion !== datasetVersion ||
                !Array.isArray(stored.guessedIds)
            ) {
                return emptyProgress;
            }

            var uniqueIds = new Set();
            stored.guessedIds.forEach(function (streetId) {
                if (validStreetIds.has(streetId)) {
                    uniqueIds.add(streetId);
                }
            });

            return {
                guessedIds: Array.from(uniqueIds),
                showMissing: Boolean(stored.showMissing)
            };
        } catch (error) {
            return emptyProgress;
        }
    }

    function saveProgress(storage, datasetVersion, guessedIds, showMissing) {
        if (!storage) {
            return false;
        }

        try {
            storage.setItem(STORAGE_KEY, JSON.stringify({
                schemaVersion: STORAGE_SCHEMA_VERSION,
                datasetVersion: datasetVersion,
                guessedIds: Array.from(guessedIds),
                showMissing: Boolean(showMissing),
                updatedAt: new Date().toISOString()
            }));
            return true;
        } catch (error) {
            return false;
        }
    }

    function clearProgress(storage) {
        if (!storage) {
            return false;
        }

        try {
            storage.removeItem(STORAGE_KEY);
            return true;
        } catch (error) {
            return false;
        }
    }

    root.MoscowStreetQuizCore = Object.freeze({
        STORAGE_KEY: STORAGE_KEY,
        normalizeAnswer: normalizeAnswer,
        withoutStreetType: withoutStreetType,
        createMatcher: createMatcher,
        getDatasetVersion: getDatasetVersion,
        loadProgress: loadProgress,
        saveProgress: saveProgress,
        clearProgress: clearProgress
    });
}(typeof window === 'undefined' ? globalThis : window));
