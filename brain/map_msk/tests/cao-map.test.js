'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

require('../quiz-core.js');

const core = globalThis.MoscowStreetQuizCore;
const dataDirectory = path.join(__dirname, '..', 'data');
const dataset = JSON.parse(
    fs.readFileSync(path.join(dataDirectory, 'cao-map.json'), 'utf8')
);
const collisionReport = JSON.parse(
    fs.readFileSync(path.join(dataDirectory, 'street_alias_collisions.json'), 'utf8')
);

function assertNonEmptyString(value, label) {
    assert.equal(typeof value, 'string', `${label} must be a string`);
    assert.notEqual(value.trim(), '', `${label} must not be empty`);
}

function assertPosition(position, label) {
    assert.ok(Array.isArray(position), `${label} must be an array`);
    assert.ok(position.length >= 2, `${label} must contain longitude and latitude`);
    assert.ok(Number.isFinite(position[0]), `${label} longitude must be finite`);
    assert.ok(Number.isFinite(position[1]), `${label} latitude must be finite`);
    assert.ok(position[0] >= -180 && position[0] <= 180, `${label} longitude is invalid`);
    assert.ok(position[1] >= -90 && position[1] <= 90, `${label} latitude is invalid`);
}

function assertMultiLineString(geometry, label) {
    assert.equal(geometry && geometry.type, 'MultiLineString', `${label} must be a MultiLineString`);
    assert.ok(Array.isArray(geometry.coordinates), `${label} coordinates must be an array`);
    assert.ok(geometry.coordinates.length > 0, `${label} must contain at least one line`);

    geometry.coordinates.forEach((line, lineIndex) => {
        assert.ok(Array.isArray(line), `${label} line ${lineIndex} must be an array`);
        assert.ok(line.length >= 2, `${label} line ${lineIndex} must contain at least two points`);
        line.forEach((position, positionIndex) => {
            assertPosition(position, `${label} line ${lineIndex} point ${positionIndex}`);
        });
    });
}

function assertPolygonGeometry(geometry, label) {
    assert.ok(geometry && ['Polygon', 'MultiPolygon'].includes(geometry.type), `${label} must be polygonal`);
    assert.ok(Array.isArray(geometry.coordinates), `${label} coordinates must be an array`);
    assert.ok(geometry.coordinates.length > 0, `${label} coordinates must not be empty`);
}

test('dataset contains exactly the ten unique CAO districts', () => {
    assert.ok(Array.isArray(dataset.districts));
    assert.equal(dataset.districts.length, 10);

    const districtIds = new Set();
    dataset.districts.forEach((district) => {
        assertNonEmptyString(district.id, 'district.id');
        assertNonEmptyString(district.name, `district ${district.id} name`);
        assert.equal(districtIds.has(district.id), false, `duplicate district id: ${district.id}`);
        districtIds.add(district.id);
        assertPolygonGeometry(district.geometry, `district ${district.id} geometry`);
    });
});

test('street IDs and geometries are valid and district references are consistent', () => {
    assert.ok(Array.isArray(dataset.streets));
    assert.ok(dataset.streets.length > 0);

    const districtIds = new Set(dataset.districts.map((district) => district.id));
    const allIds = new Set(districtIds);

    dataset.streets.forEach((street) => {
        assertNonEmptyString(street.id, 'street.id');
        assertNonEmptyString(street.name, `street ${street.id} name`);
        assertNonEmptyString(street.kind, `street ${street.id} kind`);
        assert.equal(allIds.has(street.id), false, `duplicate entity id: ${street.id}`);
        allIds.add(street.id);

        assertMultiLineString(street.geometry, `street ${street.id} geometry`);
        assert.ok(Array.isArray(street.districtIds), `street ${street.id} districtIds must be an array`);
        assert.ok(street.districtIds.length > 0, `street ${street.id} must belong to a district`);
        assert.equal(
            new Set(street.districtIds).size,
            street.districtIds.length,
            `street ${street.id} contains duplicate district IDs`
        );
        street.districtIds.forEach((districtId) => {
            assert.ok(districtIds.has(districtId), `street ${street.id} references unknown district ${districtId}`);
        });
        assert.ok(
            districtIds.has(street.quizDistrictId),
            `street ${street.id} has invalid quizDistrictId ${street.quizDistrictId}`
        );
        assert.ok(
            street.districtIds.includes(street.quizDistrictId),
            `street ${street.id} quizDistrictId is outside districtIds`
        );
    });
});

test('quiz excludes duplicate carriageways, projected roads and technical structures', () => {
    const allowedKinds = new Set([
        'аллея',
        'бульвар',
        'линия',
        'набережная',
        'переулок',
        'площадь',
        'проезд',
        'просек',
        'проспект',
        'тупик',
        'улица',
        'шоссе'
    ]);

    dataset.streets.forEach((street) => {
        assert.ok(allowedKinds.has(street.kind), `disallowed quiz kind: ${street.kind}`);
        assert.doesNotMatch(street.name, /\(дубл[её]р\)/iu);
        assert.doesNotMatch(street.name, /^проектируемый проезд\b/iu);

        const aliases = (street.aliases || []).map(core.normalizeAnswer);
        assert.equal(
            new Set(aliases).size,
            aliases.length,
            `street ${street.id} contains duplicate aliases`
        );
    });
});

test('metadata records the local OpenStreetMap dataset and its licence', () => {
    assert.ok(dataset.meta && typeof dataset.meta === 'object');
    assert.ok(Number.isInteger(dataset.meta.schemaVersion));
    assert.ok(dataset.meta.schemaVersion > 0);
    assertNonEmptyString(dataset.meta.datasetVersion, 'meta.datasetVersion');
    assert.equal(dataset.meta.coordinateOrder, 'longitude-latitude');
    assert.equal(dataset.meta.crs, 'EPSG:4326');
    assert.equal(Number.isNaN(Date.parse(dataset.meta.generatedAt)), false);
    assert.ok(Array.isArray(dataset.meta.bbox));
    assert.equal(dataset.meta.bbox.length, 4);
    dataset.meta.bbox.forEach((coordinate) => assert.ok(Number.isFinite(coordinate)));

    assert.ok(dataset.meta.source && typeof dataset.meta.source === 'object');
    assert.equal(dataset.meta.source.name, 'OpenStreetMap');
    assert.equal(dataset.meta.source.license, 'ODbL-1.0');
    assert.match(dataset.meta.source.copyrightUrl, /^https:\/\/www\.openstreetmap\.org\//);

    assert.equal(dataset.meta.counts.districts, dataset.districts.length);
    assert.equal(dataset.meta.counts.streets, dataset.streets.length);
});

test('context contains uniquely identified CAO boundary and Moskva River features', () => {
    assert.ok(Array.isArray(dataset.context));
    assert.equal(dataset.context.length, 2);

    const entityIds = new Set([
        ...dataset.districts.map((district) => district.id),
        ...dataset.streets.map((street) => street.id)
    ]);
    dataset.context.forEach((feature) => {
        assertNonEmptyString(feature.id, 'context feature id');
        assertNonEmptyString(feature.name, `context ${feature.id} name`);
        assertNonEmptyString(feature.kind, `context ${feature.id} kind`);
        assert.equal(entityIds.has(feature.id), false, `duplicate entity id: ${feature.id}`);
        entityIds.add(feature.id);
    });

    const caoBoundary = dataset.context.find((feature) => feature.id === 'cao-boundary');
    const moskvaRiver = dataset.context.find((feature) => feature.id === 'moskva-river');

    assert.ok(caoBoundary);
    assert.equal(caoBoundary.kind, 'boundary');
    assertPolygonGeometry(
        caoBoundary.geometry,
        'context cao-boundary geometry'
    );

    assert.ok(moskvaRiver);
    assert.equal(moskvaRiver.kind, 'river');
    assertMultiLineString(
        moskvaRiver.geometry,
        'context moskva-river geometry'
    );
});

test('all published names and aliases match exactly one street', () => {
    const matcher = core.createMatcher(dataset.streets);

    dataset.streets.forEach((street) => {
        [street.name].concat(street.aliases || []).forEach((alias) => {
            const result = matcher.match(alias);
            assert.equal(result.status, 'match', `alias is not unique: ${alias}`);
            assert.equal(result.streetId, street.id, `alias points to another street: ${alias}`);
        });
    });
});

test('matcher conflicts exactly match the generated collision report', () => {
    assert.ok(Array.isArray(collisionReport.collisions));
    assert.equal(collisionReport.collisions.length, dataset.meta.counts.aliasCollisions);

    const matcher = core.createMatcher(dataset.streets);
    const expected = new Map();

    collisionReport.collisions.forEach((collision) => {
        assert.equal(collision.omitted, true, `collision is not marked omitted: ${collision.alias}`);
        const alias = core.normalizeAnswer(collision.alias);
        assertNonEmptyString(alias, 'normalized collision alias');
        expected.set(
            alias,
            collision.streets.map((street) => street.id).sort()
        );
    });

    assert.deepEqual(
        Array.from(matcher.conflicts.keys()).sort(),
        Array.from(expected.keys()).sort()
    );

    expected.forEach((streetIds, alias) => {
        const result = matcher.match(alias);
        assert.equal(result.status, 'ambiguous', `collision is accepted as an answer: ${alias}`);
        assert.deepEqual(result.streetIds.slice().sort(), streetIds);
    });
});
