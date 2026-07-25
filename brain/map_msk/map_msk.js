(function () {
    'use strict';

    var DATA_URL = './data/cao-map.json';
    var ANSWER_DELAY_MS = 350;
    var MOSCOW_CENTER = [55.7558, 37.6173];

    var core;
    var map;
    var elements = {};
    var answerTimer = null;
    var loadRequestId = 0;
    var isComposing = false;

    var state = {
        loaded: false,
        meta: {},
        datasetVersion: '',
        districts: [],
        streets: [],
        context: [],
        streetById: new Map(),
        districtById: new Map(),
        streetsByDistrict: new Map(),
        districtCards: new Map(),
        streetLayers: new Map(),
        guessedIds: new Set(),
        pulsingIds: new Set(),
        pulseTimers: new Map(),
        matcher: null,
        showMissing: false,
        complete: false,
        selectedStreetId: null,
        hoveredStreetId: null,
        streetPickerBuilt: false,
        storage: null,
        storageWarningShown: false,
        contextLayer: null,
        districtLayer: null,
        streetLayer: null
    };

    function init() {
        cacheElements();
        bindPageEvents();

        if (!window.L || !window.MoscowStreetQuizCore) {
            showLoadError(
                new Error('Не загрузились локальные библиотеки карты.'),
                'Не загрузились локальные файлы тренажёра. Перезагрузите страницу и попробуйте ещё раз.'
            );
            return;
        }

        core = window.MoscowStreetQuizCore;
        state.storage = getLocalStorage();
        createMap();
        loadQuizData();
    }

    function cacheElements() {
        elements.panel = document.getElementById('quiz-panel');
        elements.input = document.getElementById('street-answer');
        elements.feedback = document.getElementById('answer-feedback');
        elements.progress = document.getElementById('quiz-progress');
        elements.progressText = document.getElementById('progress-text');
        elements.toggleMissing = document.getElementById('toggle-missing');
        elements.reset = document.getElementById('reset-quiz');
        elements.error = document.getElementById('quiz-error');
        elements.errorMessage = document.getElementById('quiz-error-message');
        elements.retry = document.getElementById('retry-load');
        elements.complete = document.getElementById('quiz-complete');
        elements.loading = document.getElementById('quiz-loading');
        elements.mapSection = document.querySelector('.quiz-map-section');
        elements.map = document.getElementById('quiz-map');
        elements.mapStreetPicker = document.getElementById('map-street-picker');
        elements.mapStreetSelect = document.getElementById('map-street-select');
        elements.mapStreetLabel = document.getElementById('map-street-label');
        elements.districtsSection = document.getElementById('quiz-districts');
        elements.districtGrid = document.getElementById('district-grid');
    }

    function bindPageEvents() {
        elements.input.addEventListener('input', scheduleAnswerCheck);
        elements.input.addEventListener('keydown', function (event) {
            if (event.key !== 'Enter' || event.isComposing || isComposing) {
                return;
            }

            event.preventDefault();
            clearAnswerTimer();
            checkAnswer();
        });
        elements.input.addEventListener('compositionstart', function () {
            isComposing = true;
            clearAnswerTimer();
        });
        elements.input.addEventListener('compositionend', function () {
            isComposing = false;
            scheduleAnswerCheck();
        });
        elements.toggleMissing.addEventListener('click', toggleMissingStreets);
        elements.reset.addEventListener('click', resetQuiz);
        elements.retry.addEventListener('click', retryLoad);
        elements.mapStreetSelect.addEventListener('change', function () {
            if (!state.complete) {
                return;
            }
            if (elements.mapStreetSelect.value) {
                selectStreet(elements.mapStreetSelect.value);
            } else {
                clearSelectedStreet();
            }
        });
        window.addEventListener('resize', function () {
            if (map) {
                window.requestAnimationFrame(function () {
                    map.invalidateSize({ animate: false });
                });
            }
        });
    }

    function retryLoad() {
        if (!window.L || !window.MoscowStreetQuizCore) {
            window.location.reload();
            return;
        }
        loadQuizData();
    }

    function createMap() {
        map = window.L.map(elements.map, {
            center: MOSCOW_CENTER,
            zoom: 11,
            zoomSnap: 0.25,
            zoomDelta: 0.5,
            zoomControl: true,
            attributionControl: true,
            keyboard: true,
            preferCanvas: false,
            maxBoundsViscosity: 0.82
        });

        map.createPane('quiz-context-pane');
        map.getPane('quiz-context-pane').style.zIndex = 210;
        map.createPane('quiz-district-pane');
        map.getPane('quiz-district-pane').style.zIndex = 220;
        map.createPane('quiz-street-pane');
        map.getPane('quiz-street-pane').style.zIndex = 430;

        map.attributionControl.setPrefix(
            '<a href="https://leafletjs.com/" target="_blank" rel="noopener noreferrer">Leaflet</a>'
        );
        map.attributionControl.addAttribution(
            '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>'
        );

        map.on('click', function () {
            if (!state.complete || !state.selectedStreetId) {
                return;
            }
            clearSelectedStreet();
        });
    }

    function loadQuizData() {
        var currentRequestId = loadRequestId + 1;
        loadRequestId = currentRequestId;
        setLoadingState(true);

        fetch(DATA_URL, {
            headers: {
                Accept: 'application/json'
            }
        })
            .then(function (response) {
                if (!response.ok) {
                    throw new Error('HTTP ' + response.status);
                }
                return response.json();
            })
            .then(function (rawData) {
                if (currentRequestId !== loadRequestId) {
                    return;
                }

                var dataset = validateAndNormalizeDataset(rawData);
                setupDataset(dataset);
            })
            .catch(function (error) {
                if (currentRequestId !== loadRequestId) {
                    return;
                }
                showLoadError(error);
            });
    }

    function collectionItems(value, label) {
        if (Array.isArray(value)) {
            return value;
        }
        if (value && value.type === 'FeatureCollection' && Array.isArray(value.features)) {
            return value.features;
        }
        throw new Error('В наборе отсутствует коллекция «' + label + '».');
    }

    function entityFromItem(item) {
        if (item && item.type === 'Feature') {
            return Object.assign({}, item.properties || {}, {
                geometry: item.geometry
            });
        }
        return Object.assign({}, item);
    }

    function hasGeometry(entity, allowedTypes) {
        return Boolean(
            entity.geometry &&
            allowedTypes.indexOf(entity.geometry.type) !== -1 &&
            Array.isArray(entity.geometry.coordinates)
        );
    }

    function validateAndNormalizeDataset(rawData) {
        if (!rawData || typeof rawData !== 'object') {
            throw new Error('Файл данных имеет неверный формат.');
        }

        var districts = collectionItems(rawData.districts, 'districts').map(entityFromItem);
        var streets = collectionItems(rawData.streets, 'streets').map(entityFromItem);
        var context = collectionItems(rawData.context || [], 'context').map(entityFromItem);

        if (districts.length !== 10) {
            throw new Error('Ожидалось 10 районов ЦАО, найдено: ' + districts.length + '.');
        }
        if (!streets.length) {
            throw new Error('Список улиц пуст.');
        }

        var districtIds = new Set();
        districts = districts.map(function (district) {
            var id = String(district.id || '').trim();
            var name = String(district.name || '').trim();

            if (!id || !name || !hasGeometry(district, ['Polygon', 'MultiPolygon'])) {
                throw new Error('У одного из районов отсутствует id, название или геометрия.');
            }
            if (districtIds.has(id)) {
                throw new Error('Повторяющийся id района: ' + id + '.');
            }

            districtIds.add(id);
            return Object.assign({}, district, {
                id: id,
                name: name
            });
        });

        var streetIds = new Set();
        streets = streets.map(function (street) {
            var id = String(street.id || '').trim();
            var name = String(street.name || '').trim();
            var quizDistrictId = String(street.quizDistrictId || '').trim();
            var aliases = Array.isArray(street.aliases) ?
                street.aliases.filter(function (alias) {
                    return typeof alias === 'string' && alias.trim();
                }) :
                [];
            var actualDistrictIds = Array.isArray(street.districtIds) ?
                street.districtIds.map(String) :
                [];

            if (!id || !name || !hasGeometry(street, ['LineString', 'MultiLineString'])) {
                throw new Error('У одной из улиц отсутствует id, название или линейная геометрия.');
            }
            if (streetIds.has(id)) {
                throw new Error('Повторяющийся id улицы: ' + id + '.');
            }
            if (!districtIds.has(quizDistrictId)) {
                throw new Error('Улица «' + name + '» привязана к неизвестному району.');
            }
            if (actualDistrictIds.some(function (districtId) {
                return !districtIds.has(districtId);
            })) {
                throw new Error('Улица «' + name + '» пересекает неизвестный район.');
            }

            streetIds.add(id);
            return Object.assign({}, street, {
                id: id,
                name: name,
                aliases: aliases,
                kind: String(street.kind || ''),
                districtIds: actualDistrictIds,
                quizDistrictId: quizDistrictId
            });
        });

        context = context.filter(function (feature) {
            return feature.geometry && typeof feature.geometry.type === 'string';
        });

        return {
            meta: rawData.meta && typeof rawData.meta === 'object' ? rawData.meta : {},
            districts: districts,
            streets: streets,
            context: context
        };
    }

    function setupDataset(dataset) {
        state.meta = dataset.meta;
        state.districts = dataset.districts.slice().sort(compareByName);
        state.streets = dataset.streets.slice().sort(compareByName);
        state.context = dataset.context;
        state.streetById = new Map();
        state.districtById = new Map();
        state.streetsByDistrict = new Map();

        state.districts.forEach(function (district) {
            state.districtById.set(district.id, district);
            state.streetsByDistrict.set(district.id, []);
        });
        state.streets.forEach(function (street) {
            state.streetById.set(street.id, street);
            state.streetsByDistrict.get(street.quizDistrictId).push(street);
        });
        state.streetsByDistrict.forEach(function (streets) {
            streets.sort(compareByName);
        });

        state.matcher = core.createMatcher(state.streets);
        state.datasetVersion = core.getDatasetVersion(
            state.meta,
            'streets-' + state.streets.length
        );

        var restored = core.loadProgress(
            state.storage,
            state.datasetVersion,
            new Set(state.streetById.keys())
        );
        state.guessedIds = new Set(restored.guessedIds);
        state.showMissing = restored.showMissing;
        state.complete = state.guessedIds.size === state.streets.length;
        state.selectedStreetId = null;
        state.hoveredStreetId = null;
        state.streetPickerBuilt = false;
        state.loaded = true;

        renderMapData();
        buildDistrictCards();
        renderInterface();
        setLoadingState(false);

        if (state.complete) {
            setFeedback('Прогресс восстановлен: все улицы уже названы.', 'success');
        } else if (state.guessedIds.size) {
            setFeedback(
                'Прогресс восстановлен: ' + state.guessedIds.size + ' из ' + state.streets.length + '.',
                'neutral'
            );
        } else {
            setFeedback('Карта готова. Начинайте вводить названия.', 'neutral');
        }

        window.requestAnimationFrame(function () {
            map.invalidateSize({ animate: false });
            if (!state.complete) {
                elements.input.focus({ preventScroll: true });
            }
        });
    }

    function featureFromEntity(entity) {
        var properties = {};
        Object.keys(entity).forEach(function (key) {
            if (key !== 'geometry') {
                properties[key] = entity[key];
            }
        });

        return {
            type: 'Feature',
            properties: properties,
            geometry: entity.geometry
        };
    }

    function renderMapData() {
        removeExistingMapLayers();
        state.streetLayers = new Map();

        state.contextLayer = window.L.geoJSON(state.context.map(featureFromEntity), {
            pane: 'quiz-context-pane',
            interactive: false,
            style: contextStyle,
            pointToLayer: function (feature, latlng) {
                return window.L.circleMarker(latlng, {
                    pane: 'quiz-context-pane',
                    radius: 2,
                    weight: 0,
                    fillColor: '#b9b9b5',
                    fillOpacity: 0.7,
                    interactive: false
                });
            }
        }).addTo(map);

        state.districtLayer = window.L.geoJSON(state.districts.map(featureFromEntity), {
            pane: 'quiz-district-pane',
            style: {
                pane: 'quiz-district-pane',
                color: '#8f8f89',
                weight: 1.2,
                opacity: 0.9,
                fillColor: '#ffffff',
                fillOpacity: 0.06
            },
            onEachFeature: function (feature, layer) {
                var tooltipContent = document.createElement('span');
                tooltipContent.textContent = feature.properties.name;
                layer.bindTooltip(tooltipContent, {
                    sticky: true,
                    direction: 'top',
                    opacity: 1
                });
            }
        }).addTo(map);

        state.streetLayer = window.L.geoJSON(state.streets.map(featureFromEntity), {
            pane: 'quiz-street-pane',
            bubblingMouseEvents: false,
            style: function (feature) {
                return streetStyle(feature.properties.id);
            },
            onEachFeature: bindStreetLayer
        }).addTo(map);

        state.streetLayers.forEach(function (layer, streetId) {
            configureStreetPath(streetId, layer);
        });

        var bounds = state.districtLayer.getBounds();
        if (!bounds.isValid()) {
            bounds = state.streetLayer.getBounds();
        }
        if (bounds.isValid()) {
            map.fitBounds(bounds, {
                padding: [12, 12],
                animate: false
            });
            map.setMaxBounds(bounds.pad(0.18));
            map.setMinZoom(Math.max(9, map.getZoom() - 1));
        }
    }

    function removeExistingMapLayers() {
        [state.contextLayer, state.districtLayer, state.streetLayer].forEach(function (layer) {
            if (layer && map.hasLayer(layer)) {
                map.removeLayer(layer);
            }
        });
    }

    function contextStyle(feature) {
        var kind = String(feature.properties.kind || '').toLocaleLowerCase('ru-RU');
        var isWater = /water|river|река|вода/.test(kind);
        var isPolygon = /Polygon/.test(feature.geometry.type);

        if (isWater) {
            return {
                pane: 'quiz-context-pane',
                color: '#c1c1bc',
                weight: 1.2,
                opacity: 0.9,
                fillColor: '#e9e9e5',
                fillOpacity: isPolygon ? 0.9 : 0
            };
        }

        return {
            pane: 'quiz-context-pane',
            color: '#b8b8b2',
            weight: 1.1,
            opacity: 0.75,
            dashArray: isPolygon ? null : '4 5',
            fillColor: '#eeeeeb',
            fillOpacity: isPolygon ? 0.3 : 0
        };
    }

    function bindStreetLayer(feature, layer) {
        var streetId = feature.properties.id;
        state.streetLayers.set(streetId, layer);

        layer.on('mouseover', function () {
            if (!state.complete) {
                return;
            }
            state.hoveredStreetId = streetId;
            refreshStreetStyle(streetId);
            updateMapStreetLabel();
        });
        layer.on('mouseout', function () {
            if (!state.complete || state.hoveredStreetId !== streetId) {
                return;
            }
            state.hoveredStreetId = null;
            refreshStreetStyle(streetId);
            updateMapStreetLabel();
        });
        layer.on('click', function (event) {
            if (!state.complete) {
                return;
            }
            window.L.DomEvent.stopPropagation(event.originalEvent);
            selectStreet(streetId);
        });
    }

    function streetStyle(streetId) {
        var emphasized = state.selectedStreetId === streetId ||
            state.hoveredStreetId === streetId;

        if (state.pulsingIds.has(streetId)) {
            return {
                pane: 'quiz-street-pane',
                className: 'quiz-map-street',
                color: '#000000',
                weight: 7,
                opacity: 1,
                lineCap: 'round',
                lineJoin: 'round'
            };
        }

        if (emphasized) {
            return {
                pane: 'quiz-street-pane',
                className: 'quiz-map-street',
                color: '#000000',
                weight: 5,
                opacity: 1,
                lineCap: 'round',
                lineJoin: 'round'
            };
        }

        if (state.guessedIds.has(streetId)) {
            return {
                pane: 'quiz-street-pane',
                className: 'quiz-map-street',
                color: '#262626',
                weight: 3.1,
                opacity: 1,
                lineCap: 'round',
                lineJoin: 'round'
            };
        }

        return {
            pane: 'quiz-street-pane',
            className: 'quiz-map-street',
            color: '#d4d4cf',
            weight: 1.25,
            opacity: 0.88,
            lineCap: 'round',
            lineJoin: 'round'
        };
    }

    function configureStreetPath(streetId, layer) {
        var path = layer.getElement();
        if (!path) {
            return;
        }

        path.setAttribute('aria-hidden', 'true');
        path.removeAttribute('tabindex');
        path.removeAttribute('role');
        path.removeAttribute('aria-label');
    }

    function scheduleAnswerCheck() {
        if (isComposing || !state.loaded || state.complete) {
            return;
        }

        clearAnswerTimer();
        if (!core.normalizeAnswer(elements.input.value)) {
            return;
        }

        answerTimer = window.setTimeout(checkAnswer, ANSWER_DELAY_MS);
    }

    function clearAnswerTimer() {
        if (answerTimer !== null) {
            window.clearTimeout(answerTimer);
            answerTimer = null;
        }
    }

    function checkAnswer() {
        clearAnswerTimer();
        if (!state.loaded || state.complete) {
            return;
        }

        var result = state.matcher.match(elements.input.value);
        if (result.status === 'empty') {
            return;
        }
        if (result.status === 'ambiguous') {
            setFeedback('Название неоднозначно — допишите тип улицы полностью.', 'warning');
            return;
        }
        if (result.status === 'unknown') {
            setFeedback('Пока нет точного совпадения.', 'neutral');
            return;
        }

        var street = state.streetById.get(result.streetId);
        elements.input.value = '';

        if (state.guessedIds.has(street.id)) {
            setFeedback('«' + street.name + '» уже была названа.', 'warning');
            pulseStreet(street.id);
            return;
        }

        state.guessedIds.add(street.id);
        pulseStreet(street.id);

        if (state.guessedIds.size === state.streets.length) {
            finishQuiz();
            return;
        }

        var progressSaved = persistProgress();
        if (progressSaved) {
            setFeedback('«' + street.name + '» — верно.', 'success');
        } else {
            setFeedback(
                '«' + street.name + '» — верно, но браузер не разрешил сохранить прогресс.',
                'warning'
            );
        }
        renderInterface({ streetId: street.id });
    }

    function pulseStreet(streetId) {
        if (state.pulseTimers.has(streetId)) {
            window.clearTimeout(state.pulseTimers.get(streetId));
        }

        state.pulsingIds.add(streetId);
        refreshStreetStyle(streetId);
        var layer = state.streetLayers.get(streetId);
        if (layer) {
            layer.bringToFront();
        }

        state.pulseTimers.set(streetId, window.setTimeout(function () {
            state.pulsingIds.delete(streetId);
            state.pulseTimers.delete(streetId);
            refreshStreetStyle(streetId);
        }, 700));
    }

    function finishQuiz() {
        state.complete = true;
        state.showMissing = false;
        var progressSaved = persistProgress();
        setFeedback(
            progressSaved ?
                'Готово: названы все улицы.' :
                'Все улицы названы, но браузер не разрешил сохранить результат.',
            progressSaved ? 'success' : 'warning'
        );
        renderInterface();
        elements.complete.setAttribute('tabindex', '-1');
        elements.complete.focus();
    }

    function toggleMissingStreets() {
        if (!state.loaded || state.complete) {
            return;
        }

        state.showMissing = !state.showMissing;
        var progressSaved = persistProgress();
        renderInterface();
        if (!progressSaved) {
            setFeedback(
                'Список переключён, но браузер не разрешил сохранить это состояние.',
                'warning'
            );
        }
    }

    function resetQuiz() {
        if (!state.loaded || !state.guessedIds.size) {
            return;
        }

        if (!window.confirm('Сбросить весь прогресс по улицам ЦАО?')) {
            return;
        }

        clearAnswerTimer();
        state.pulseTimers.forEach(function (timerId) {
            window.clearTimeout(timerId);
        });
        state.pulseTimers.clear();
        state.pulsingIds.clear();
        state.guessedIds.clear();
        state.showMissing = false;
        state.complete = false;
        state.selectedStreetId = null;
        state.hoveredStreetId = null;
        elements.input.value = '';
        elements.mapStreetSelect.value = '';
        var progressCleared = core.clearProgress(state.storage);
        setFeedback(
            progressCleared ?
                'Прогресс сброшен. Можно начать заново.' :
                'Прогресс сброшен на этой странице, но браузер не разрешил очистить сохранение.',
            progressCleared ? 'neutral' : 'warning'
        );
        renderInterface();
        elements.input.focus({ preventScroll: true });
    }

    function selectStreet(streetId) {
        var previousId = state.selectedStreetId;
        state.selectedStreetId = streetId;
        if (previousId) {
            refreshStreetStyle(previousId);
        }
        refreshStreetStyle(streetId);
        elements.mapStreetSelect.value = streetId;
        updateMapStreetLabel();
    }

    function clearSelectedStreet() {
        var previousId = state.selectedStreetId;
        state.selectedStreetId = null;
        elements.mapStreetSelect.value = '';
        if (previousId) {
            refreshStreetStyle(previousId);
        }
        updateMapStreetLabel();
    }

    function refreshStreetStyle(streetId) {
        var layer = state.streetLayers.get(streetId);
        if (layer) {
            layer.setStyle(streetStyle(streetId));
            configureStreetPath(streetId, layer);
        }
    }

    function refreshAllStreetStyles() {
        state.streetLayers.forEach(function (layer, streetId) {
            layer.setStyle(streetStyle(streetId));
            configureStreetPath(streetId, layer);
        });
    }

    function buildDistrictCards() {
        elements.districtGrid.replaceChildren();
        state.districtCards = new Map();

        state.districts.forEach(function (district) {
            var card = document.createElement('section');
            var header = document.createElement('div');
            var heading = document.createElement('h3');
            var count = document.createElement('span');
            var progress = document.createElement('progress');
            var list = document.createElement('ul');
            var empty = document.createElement('p');

            card.className = 'quiz-district-card';
            header.className = 'quiz-district-header';
            count.className = 'quiz-district-count';
            progress.className = 'quiz-district-progress';
            list.className = 'quiz-district-list';
            empty.className = 'quiz-district-empty';

            heading.textContent = district.name;
            empty.textContent = 'Пока ничего не угадано.';
            progress.setAttribute('aria-label', 'Прогресс района ' + district.name);

            header.append(heading, count);
            card.append(header, progress, list, empty);
            elements.districtGrid.append(card);

            state.districtCards.set(district.id, {
                root: card,
                count: count,
                progress: progress,
                list: list,
                empty: empty
            });
        });
    }

    function buildStreetPicker() {
        elements.mapStreetSelect.replaceChildren();
        var emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = 'Выберите улицу';
        elements.mapStreetSelect.append(emptyOption);

        state.streets.forEach(function (street) {
            var option = document.createElement('option');
            option.value = street.id;
            option.textContent = street.name;
            elements.mapStreetSelect.append(option);
        });
        state.streetPickerBuilt = true;
    }

    function renderInterface(options) {
        var guessedCount = state.guessedIds.size;
        var total = state.streets.length;
        var percentage = total ? Math.round(guessedCount / total * 100) : 0;

        elements.progress.max = Math.max(total, 1);
        elements.progress.value = guessedCount;
        elements.progress.textContent = percentage + '%';
        elements.progressText.textContent = guessedCount + ' / ' + total;

        elements.input.disabled = !state.loaded || state.complete;
        elements.toggleMissing.disabled = !state.loaded || state.complete;
        elements.toggleMissing.setAttribute('aria-pressed', String(state.showMissing));
        elements.toggleMissing.textContent = state.showMissing ?
            'Скрыть оставшиеся' :
            'Показать оставшиеся';
        elements.reset.disabled = !state.loaded || guessedCount === 0;
        elements.complete.hidden = !state.complete;
        if (state.complete && !state.streetPickerBuilt) {
            buildStreetPicker();
        }
        elements.mapStreetPicker.hidden = !state.complete;
        elements.map.classList.toggle('is-complete', state.complete);

        if (options && options.streetId) {
            renderDistrictCard(state.streetById.get(options.streetId).quizDistrictId);
        } else {
            renderDistrictCards();
            refreshAllStreetStyles();
        }
        updateMapStreetLabel();
    }

    function renderDistrictCards() {
        state.districts.forEach(function (district) {
            renderDistrictCard(district.id);
        });
    }

    function renderDistrictCard(districtId) {
        var district = state.districtById.get(districtId);
        var card = state.districtCards.get(districtId);
        var streets = state.streetsByDistrict.get(districtId);
        var guessedStreets = streets.filter(function (street) {
            return state.guessedIds.has(street.id);
        });
        var guessedCount = guessedStreets.length;
        var showAll = state.showMissing || state.complete;
        var visibleStreets = showAll ? streets : guessedStreets;

        card.count.textContent = guessedCount + ' / ' + streets.length;
        card.progress.max = Math.max(streets.length, 1);
        card.progress.value = guessedCount;
        card.root.setAttribute(
            'aria-label',
            district.name + ': ' + guessedCount + ' из ' + streets.length
        );
        card.list.replaceChildren();

        visibleStreets.forEach(function (street) {
            var item = document.createElement('li');
            item.textContent = street.name;
            item.className = state.guessedIds.has(street.id) ?
                'is-guessed' :
                'is-missing';
            card.list.append(item);
        });

        if (!showAll && guessedCount < streets.length) {
            var remaining = document.createElement('li');
            remaining.className = 'is-placeholder';
            remaining.textContent = '••• осталось ' + (streets.length - guessedCount);
            card.list.append(remaining);
        }

        card.list.hidden = card.list.childElementCount === 0;
        card.empty.hidden = true;
    }

    function updateMapStreetLabel() {
        var activeStreetId = state.hoveredStreetId || state.selectedStreetId;
        if (state.complete && activeStreetId && state.streetById.has(activeStreetId)) {
            var street = state.streetById.get(activeStreetId);
            var districtNames = street.districtIds.map(function (districtId) {
                var district = state.districtById.get(districtId);
                return district ? district.name : districtId;
            });
            elements.mapStreetLabel.textContent = street.name +
                (districtNames.length ? ' — ' + districtNames.join(', ') : '');
            return;
        }
        if (state.complete) {
            elements.mapStreetLabel.textContent =
                'Наведите курсор на улицу, нажмите на неё или выберите с клавиатуры.';
            return;
        }
        elements.mapStreetLabel.textContent = 'Угаданные улицы будут выделены чёрным.';
    }

    function persistProgress() {
        var saved = core.saveProgress(
            state.storage,
            state.datasetVersion,
            state.guessedIds,
            state.showMissing
        );

        if (!saved && !state.storageWarningShown) {
            state.storageWarningShown = true;
        }
        return saved;
    }

    function getLocalStorage() {
        try {
            return window.localStorage;
        } catch (error) {
            return null;
        }
    }

    function setLoadingState(isLoading) {
        elements.panel.setAttribute('aria-busy', String(isLoading));
        elements.loading.hidden = !isLoading;
        elements.error.hidden = true;
        elements.retry.disabled = isLoading;
        elements.mapSection.hidden = false;
        elements.districtsSection.hidden = isLoading;

        if (isLoading) {
            elements.input.disabled = true;
            elements.toggleMissing.disabled = true;
            elements.reset.disabled = true;
            setFeedback('Загружаю карту и список улиц…', 'neutral');
        }
    }

    function showLoadError(error, message) {
        console.error('Moscow streets quiz:', error);
        state.loaded = false;
        elements.panel.setAttribute('aria-busy', 'false');
        elements.loading.hidden = true;
        elements.error.hidden = false;
        elements.mapSection.hidden = true;
        elements.districtsSection.hidden = true;
        elements.errorMessage.textContent = message ||
            'Не удалось прочитать локальный набор улиц. Проверьте соединение и попробуйте ещё раз.';
        elements.retry.disabled = false;
        elements.input.disabled = true;
        elements.toggleMissing.disabled = true;
        elements.reset.disabled = true;
        setFeedback('Тренажёр временно недоступен.', 'warning');
    }

    function setFeedback(message, tone) {
        elements.feedback.textContent = message;
        elements.feedback.classList.remove('is-success', 'is-warning', 'is-neutral');
        if (tone) {
            elements.feedback.classList.add('is-' + tone);
        }
    }

    function compareByName(left, right) {
        return left.name.localeCompare(right.name, 'ru');
    }

    init();
}());
