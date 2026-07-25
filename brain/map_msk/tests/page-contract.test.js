'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const trainerDirectory = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(trainerDirectory, 'map_msk.html'), 'utf8');
const script = fs.readFileSync(path.join(trainerDirectory, 'map_msk.js'), 'utf8');

test('page keeps the requested quiz control order and concise copy', () => {
    const positions = [
        'id="mode-quiz"',
        'id="quiz-panel"',
        'id="quiz-map"',
        'id="quiz-actions"',
        'id="quiz-districts"'
    ].map((marker) => page.indexOf(marker));

    positions.forEach((position) => assert.notEqual(position, -1));
    assert.deepEqual(positions.slice().sort((left, right) => left - right), positions);

    [
        'тренировка памяти',
        'без подтверждения кнопкой',
        'Нажимать Enter необязательно',
        'Регистр, «ё/е»'
    ].forEach((copy) => assert.equal(page.includes(copy), false, `obsolete copy remains: ${copy}`));
});

test('trainer uses only local map dependencies at runtime', () => {
    assert.match(page, /href="\.\/vendor\/leaflet\/leaflet\.css"/);
    assert.match(page, /src="\.\/vendor\/leaflet\/leaflet\.js"/);
    assert.match(script, /var DATA_URL = '\.\/data\/cao-map\.json';/);
    assert.doesNotMatch(page + script, /api-maps\.yandex|overpass-api|tile\.openstreetmap/iu);
});

test('district layer is noninteractive and street inspection is mode-aware', () => {
    const districtLayerStart = script.indexOf('state.districtLayer = window.L.geoJSON');
    const streetLayerStart = script.indexOf('state.streetLayer = window.L.geoJSON');
    assert.notEqual(districtLayerStart, -1);
    assert.ok(streetLayerStart > districtLayerStart);

    const districtLayerCode = script.slice(districtLayerStart, streetLayerStart);
    assert.match(districtLayerCode, /interactive:\s*false/);
    assert.doesNotMatch(districtLayerCode, /bindTooltip|bindPopup/);

    assert.match(script, /core\.isStreetInspectable/);
    assert.match(script, /dashArray:\s*'6 5'/);
    assert.match(script, /state\.mode === 'learning'/);
});
