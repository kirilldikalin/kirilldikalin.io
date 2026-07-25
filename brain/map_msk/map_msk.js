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
        mode: 'quiz',
        quizDistrictId: '',
        allowShortAnswers: false,
        learningDistrictIds: new Set(),
        showMissing: false,
        complete: false,
        selectedStreetId: null,
        hoveredStreetId: null,
        streetPickerBuilt: false,
        storage: null,
        storageWarningShown: false,
        contextLayer: null,
        districtLayer: null,
        districtLayers: new Map(),
        streetLayer: null,
        fullBounds: null
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
        elements.modeQuiz = document.getElementById('mode-quiz');
        elements.modeLearning = document.getElementById('mode-learning');
        elements.quizDistrictSelect = document.getElementById('quiz-district-select');
        elements.allowShortAnswers = document.getElementById('allow-short-answers');
        elements.learningControls = document.getElementById('learning-controls');
        elements.learningDistrictFilter = document.getElementById('learning-district-filter');
        elements.input = document.getElementById('street-answer');
        elements.feedback = document.getElementById('answer-feedback');
        elements.progress = document.getElementById('quiz-progress');
        elements.progressText = document.getElementById('progress-text');
        elements.toggleMissing = document.getElementById('toggle-missing');
        elements.reset = document.getElementById('reset-quiz');
        elements.actions = document.getElementById('quiz-actions');
        elements.error = document.getElementById('quiz-error');
        elements.errorMessage = document.getElementById('quiz-error-message');
        elements.retry = document.getElementById('retry-load');
        elements.complete = document.getElementById('quiz-complete');
        elements.completeTitle = document.getElementById('quiz-complete-title');
        elements.completeCopy = document.getElementById('quiz-complete-copy');
        elements.loading = document.getElementById('quiz-loading');
        elements.mapSection = document.querySelector('.quiz-map-section');
        elements.map = document.getElementById('quiz-map');
        elements.mapStreetPicker = document.getElementById('map-street-picker');
        elements.mapStreetSelect = document.getElementById('map-street-select');
        elements.mapStreetLabel = document.getElementById('map-street-label');
        elements.districtsSection = document.getElementById('quiz-districts');
        elements.districtsDescription = document.getElementById('districts-description');
        elements.districtGrid = document.getElementById('district-grid');
    }

    function bindPageEvents() {
        elements.input.addEventListener('input', scheduleAnswerCheck);
        elements.modeQuiz.addEventListener('click', function () {
            setMode('quiz');
        });
        elements.modeLearning.addEventListener('click', function () {
            setMode('learning');
        });
        elements.quizDistrictSelect.addEventListener('change', updateQuizDistrictSelection);
        elements.allowShortAnswers.addEventListener('change', updateAnswerMode);
        elements.learningDistrictFilter.addEventListener('change', function (event) {
            if (!event.target.matches('input[type="checkbox"][data-district-id]')) {
                return;
            }
            updateLearningDistrictSelection();
        });
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
            if (!state.selectedStreetId) {
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
            throw new Error('Список объектов пуст.');
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

            if (!id || !name || !hasGeometry(street, ['Point', 'LineString', 'MultiLineString'])) {
                throw new Error('У одного из объектов отсутствует id, название или геометрия.');
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
            new Set(state.streetById.keys()),
            new Set(state.districtById.keys())
        );
        state.guessedIds = new Set(restored.guessedIds);
        state.showMissing = restored.showMissing;
        state.mode = restored.mode;
        state.quizDistrictId = restored.quizDistrictId;
        state.allowShortAnswers = restored.allowShortAnswers;
        state.learningDistrictIds = new Set(restored.learningDistrictIds);
        updateQuizCompletion();
        state.selectedStreetId = null;
        state.hoveredStreetId = null;
        state.streetPickerBuilt = false;
        state.loaded = true;

        renderMapData();
        buildQuizDistrictSelect();
        buildLearningDistrictFilter();
        buildDistrictCards();
        renderInterface();
        setLoadingState(false);

        var quizProgress = getQuizProgress();
        if (state.complete) {
            setFeedback('Прогресс восстановлен: все выбранные объекты уже названы.', 'success');
        } else if (quizProgress.guessedCount) {
            setFeedback(
                'Прогресс восстановлен: ' + quizProgress.guessedCount +
                    ' из ' + quizProgress.total + '.',
                'neutral'
            );
        } else {
            setFeedback('Карта готова.', 'neutral');
        }

        window.requestAnimationFrame(function () {
            map.invalidateSize({ animate: false });
            if (state.mode === 'learning') {
                fitLearningSelection();
            } else {
                fitQuizSelection();
                if (!state.complete) {
                    elements.input.focus({ preventScroll: true });
                }
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
        state.districtLayers = new Map();

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
            interactive: false,
            style: {
                pane: 'quiz-district-pane',
                color: '#8f8f89',
                weight: 1.2,
                opacity: 0.9,
                fillColor: '#ffffff',
                fillOpacity: 0.06
            },
            onEachFeature: function (feature, layer) {
                state.districtLayers.set(feature.properties.id, layer);
            }
        }).addTo(map);

        state.streetLayer = window.L.geoJSON(state.streets.map(featureFromEntity), {
            pane: 'quiz-street-pane',
            bubblingMouseEvents: false,
            style: function (feature) {
                return streetStyle(feature.properties.id);
            },
            pointToLayer: function (feature, latlng) {
                return window.L.circleMarker(
                    latlng,
                    streetStyle(feature.properties.id)
                );
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
            state.fullBounds = bounds;
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
            if (!canInspectStreet(streetId)) {
                return;
            }
            state.hoveredStreetId = streetId;
            refreshStreetStyle(streetId);
            updateMapStreetLabel();
        });
        layer.on('mouseout', function () {
            if (state.hoveredStreetId !== streetId) {
                return;
            }
            state.hoveredStreetId = null;
            refreshStreetStyle(streetId);
            updateMapStreetLabel();
        });
        layer.on('click', function (event) {
            if (!canInspectStreet(streetId)) {
                return;
            }
            window.L.DomEvent.stopPropagation(event.originalEvent);
            selectStreet(streetId);
        });
    }

    function isLearningStreetAvailable(streetId) {
        var street = state.streetById.get(streetId);
        return Boolean(
            street &&
            core.streetMatchesDistrictSelection(street, state.learningDistrictIds)
        );
    }

    function isStreetInQuizScope(streetId) {
        var street = state.streetById.get(streetId);
        return Boolean(
            street &&
            core.streetMatchesQuizDistrict(street, state.quizDistrictId)
        );
    }

    function getQuizScopeStreets() {
        return state.streets.filter(function (street) {
            return core.streetMatchesQuizDistrict(street, state.quizDistrictId);
        });
    }

    function getQuizProgress() {
        var streets = getQuizScopeStreets();
        var guessedCount = streets.filter(function (street) {
            return state.guessedIds.has(street.id);
        }).length;

        return {
            streets: streets,
            total: streets.length,
            guessedCount: guessedCount
        };
    }

    function updateQuizCompletion() {
        var progress = getQuizProgress();
        state.complete = progress.total > 0 && progress.guessedCount === progress.total;
        return progress;
    }

    function canInspectStreet(streetId) {
        if (!state.loaded) {
            return false;
        }
        return core.isStreetInspectable(
            state.mode,
            state.complete,
            state.guessedIds.has(streetId),
            isLearningStreetAvailable(streetId),
            isStreetInQuizScope(streetId)
        );
    }

    function streetStyle(streetId) {
        var emphasized = state.selectedStreetId === streetId ||
            state.hoveredStreetId === streetId;
        var street = state.streetById.get(streetId);
        var isPoint = Boolean(street && street.geometry.type === 'Point');
        var baseStyle = {
            pane: 'quiz-street-pane',
            className: 'quiz-map-street',
            lineCap: 'round',
            lineJoin: 'round',
            dashArray: null,
            fill: isPoint
        };

        if (state.pulsingIds.has(streetId)) {
            return Object.assign({}, baseStyle, {
                color: '#000000',
                weight: 7,
                opacity: 1,
                radius: 7,
                fillColor: '#000000',
                fillOpacity: 1
            });
        }

        if (emphasized) {
            return Object.assign({}, baseStyle, {
                color: '#000000',
                weight: 5,
                opacity: 1,
                radius: 7,
                fillColor: '#000000',
                fillOpacity: 1
            });
        }

        if (state.mode === 'learning') {
            if (isLearningStreetAvailable(streetId)) {
                return Object.assign({}, baseStyle, {
                    color: '#b6b6b0',
                    weight: 1.6,
                    opacity: 0.95,
                    radius: 3.5,
                    fillColor: '#b6b6b0',
                    fillOpacity: 0.95
                });
            }
            return Object.assign({}, baseStyle, {
                color: '#e1e1dc',
                weight: 0.9,
                opacity: 0.38,
                radius: 2.5,
                fillColor: '#e1e1dc',
                fillOpacity: 0.38
            });
        }

        if (!isStreetInQuizScope(streetId)) {
            return Object.assign({}, baseStyle, {
                color: '#e1e1dc',
                weight: 0.9,
                opacity: 0.3,
                radius: 2.5,
                fillColor: '#e1e1dc',
                fillOpacity: 0.3
            });
        }

        if (state.guessedIds.has(streetId)) {
            return Object.assign({}, baseStyle, {
                color: '#262626',
                weight: 3.1,
                opacity: 1,
                radius: 4.5,
                fillColor: '#262626',
                fillOpacity: 1
            });
        }

        if (state.showMissing) {
            return Object.assign({}, baseStyle, {
                color: '#74746e',
                weight: 2.15,
                opacity: 0.95,
                dashArray: '6 5',
                radius: 4,
                fillColor: '#74746e',
                fillOpacity: 0.95
            });
        }

        return Object.assign({}, baseStyle, {
            color: '#d4d4cf',
            weight: 1.25,
            opacity: 0.88,
            radius: 2.7,
            fillColor: '#d4d4cf',
            fillOpacity: 0.88
        });
    }

    function configureStreetPath(streetId, layer) {
        var path = layer.getElement();
        if (!path) {
            return;
        }

        var inspectable = canInspectStreet(streetId);
        path.classList.toggle('is-interactive', inspectable);
        if (!inspectable) {
            if (
                typeof layer.getTooltip === 'function' &&
                layer.getTooltip() &&
                typeof layer.unbindTooltip === 'function'
            ) {
                layer.unbindTooltip();
            }
            path.setAttribute('aria-hidden', 'true');
            path.removeAttribute('tabindex');
            path.removeAttribute('role');
            path.removeAttribute('aria-label');
            return;
        }

        var street = state.streetById.get(streetId);
        if (
            typeof layer.getTooltip === 'function' &&
            !layer.getTooltip() &&
            typeof layer.bindTooltip === 'function'
        ) {
            layer.bindTooltip(street.name, {
                sticky: true,
                direction: 'top',
                opacity: 1
            });
        }
        path.removeAttribute('aria-hidden');
        path.setAttribute('tabindex', '0');
        path.setAttribute('role', 'button');
        path.setAttribute('aria-label', street.name);
        if (path.dataset.quizKeyboardBound) {
            return;
        }
        path.dataset.quizKeyboardBound = 'true';
        path.addEventListener('focus', function () {
            if (!canInspectStreet(streetId)) {
                return;
            }
            state.hoveredStreetId = streetId;
            refreshStreetStyle(streetId);
            updateMapStreetLabel();
        });
        path.addEventListener('blur', function () {
            if (state.hoveredStreetId !== streetId) {
                return;
            }
            state.hoveredStreetId = null;
            refreshStreetStyle(streetId);
            updateMapStreetLabel();
        });
        path.addEventListener('keydown', function (event) {
            if ((event.key === 'Enter' || event.key === ' ') &&
                canInspectStreet(streetId)) {
                event.preventDefault();
                selectStreet(streetId);
            }
        });
    }

    function scheduleAnswerCheck() {
        if (isComposing || !state.loaded || state.complete || state.mode !== 'quiz') {
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
        if (!state.loaded || state.complete || state.mode !== 'quiz') {
            return;
        }

        var result = state.matcher.match(elements.input.value, {
            allowTypeOmission: state.allowShortAnswers
        });
        if (result.status === 'empty') {
            return;
        }
        if (result.status === 'incomplete') {
            return;
        }
        if (
            result.status === 'ambiguous' &&
            result.typeOmitted &&
            state.quizDistrictId
        ) {
            var scopedStreetIds = result.streetIds.filter(isStreetInQuizScope);
            if (scopedStreetIds.length === 1) {
                result = {
                    status: 'match',
                    streetId: scopedStreetIds[0],
                    normalizedValue: result.normalizedValue,
                    typeOmitted: true
                };
            } else if (scopedStreetIds.length === 0) {
                setFeedback('Этот объект не относится к выбранному району.', 'warning');
                return;
            }
        }
        if (result.status === 'ambiguous') {
            setFeedback('Название неоднозначно.', 'warning');
            return;
        }
        if (result.status === 'unknown') {
            setFeedback('Пока нет точного совпадения.', 'neutral');
            return;
        }

        var street = state.streetById.get(result.streetId);
        if (!isStreetInQuizScope(street.id)) {
            setFeedback('Этот объект не относится к выбранному району.', 'warning');
            return;
        }

        if (state.guessedIds.has(street.id)) {
            elements.input.value = '';
            setFeedback('«' + street.name + '» уже была названа.', 'warning');
            pulseStreet(street.id);
            return;
        }

        elements.input.value = '';
        state.guessedIds.add(street.id);
        pulseStreet(street.id);

        updateQuizCompletion();
        if (state.complete) {
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
        var district = state.districtById.get(state.quizDistrictId);
        var successMessage = district ?
            'Готово: названы все объекты района «' + district.name + '».' :
            'Готово: названы все объекты.';
        setFeedback(
            progressSaved ?
                successMessage :
                'Все объекты названы, но браузер не разрешил сохранить результат.',
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
        var quizProgress = getQuizProgress();
        if (!state.loaded || !quizProgress.guessedCount) {
            return;
        }

        var district = state.districtById.get(state.quizDistrictId);
        var confirmation = district ?
            'Сбросить прогресс района «' + district.name + '»?' :
            'Сбросить весь прогресс по ЦАО?';
        if (!window.confirm(confirmation)) {
            return;
        }

        clearAnswerTimer();
        state.pulseTimers.forEach(function (timerId) {
            window.clearTimeout(timerId);
        });
        state.pulseTimers.clear();
        state.pulsingIds.clear();
        quizProgress.streets.forEach(function (street) {
            state.guessedIds.delete(street.id);
        });
        state.showMissing = false;
        updateQuizCompletion();
        state.selectedStreetId = null;
        state.hoveredStreetId = null;
        elements.input.value = '';
        elements.mapStreetSelect.value = '';
        var progressCleared = persistProgress();
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
        if (state.mode === 'quiz' && state.complete) {
            elements.mapStreetSelect.value = streetId;
        }
        updateMapStreetLabel();
    }

    function clearSelectedStreet() {
        var previousId = state.selectedStreetId;
        state.selectedStreetId = null;
        if (elements.mapStreetSelect) {
            elements.mapStreetSelect.value = '';
        }
        if (previousId) {
            refreshStreetStyle(previousId);
        }
        updateMapStreetLabel();
    }

    function refreshStreetStyle(streetId) {
        var layer = state.streetLayers.get(streetId);
        if (layer) {
            var style = streetStyle(streetId);
            layer.setStyle(style);
            if (typeof layer.setRadius === 'function' && style.radius) {
                layer.setRadius(style.radius);
            }
            configureStreetPath(streetId, layer);
        }
    }

    function refreshAllStreetStyles() {
        state.streetLayers.forEach(function (layer, streetId) {
            var style = streetStyle(streetId);
            layer.setStyle(style);
            if (typeof layer.setRadius === 'function' && style.radius) {
                layer.setRadius(style.radius);
            }
            configureStreetPath(streetId, layer);
        });
    }

    function buildQuizDistrictSelect() {
        elements.quizDistrictSelect.replaceChildren();

        var allDistricts = document.createElement('option');
        allDistricts.value = '';
        allDistricts.textContent = 'Весь ЦАО';
        elements.quizDistrictSelect.append(allDistricts);

        state.districts.forEach(function (district) {
            var option = document.createElement('option');
            option.value = district.id;
            option.textContent = district.name;
            elements.quizDistrictSelect.append(option);
        });

        elements.quizDistrictSelect.value = state.quizDistrictId;
    }

    function updateQuizDistrictSelection() {
        if (!state.loaded) {
            return;
        }

        var districtId = elements.quizDistrictSelect.value;
        state.quizDistrictId = state.districtById.has(districtId) ? districtId : '';
        state.streetPickerBuilt = false;
        state.selectedStreetId = null;
        state.hoveredStreetId = null;
        closeStreetTooltips();
        updateQuizCompletion();
        persistProgress();
        renderInterface();
        fitQuizSelection();

        var district = state.districtById.get(state.quizDistrictId);
        setFeedback(
            district ?
                'Выбран район «' + district.name + '».' :
                'Выбран весь ЦАО.',
            'neutral'
        );
        if (!state.complete) {
            elements.input.focus({ preventScroll: true });
        }
    }

    function updateAnswerMode() {
        if (!state.loaded) {
            return;
        }

        state.allowShortAnswers = elements.allowShortAnswers.checked;
        persistProgress();
        setFeedback(
            state.allowShortAnswers ?
                'Можно вводить название без типа объекта.' :
                'Снова требуется полное название с типом объекта.',
            'neutral'
        );
        if (state.allowShortAnswers) {
            scheduleAnswerCheck();
        }
        elements.input.focus({ preventScroll: true });
    }

    function buildLearningDistrictFilter() {
        elements.learningDistrictFilter.replaceChildren();
        state.districts.forEach(function (district) {
            var label = document.createElement('label');
            var input = document.createElement('input');
            var text = document.createElement('span');

            label.className = 'quiz-district-choice';
            input.type = 'checkbox';
            input.dataset.districtId = district.id;
            input.checked = state.learningDistrictIds.has(district.id);
            text.textContent = district.name;
            label.append(input, text);
            elements.learningDistrictFilter.append(label);
        });
    }

    function updateLearningDistrictSelection() {
        var selectedIds = new Set();
        elements.learningDistrictFilter
            .querySelectorAll('input[data-district-id]:checked')
            .forEach(function (input) {
                selectedIds.add(input.dataset.districtId);
            });
        state.learningDistrictIds = selectedIds;
        closeStreetTooltips();
        state.selectedStreetId = null;
        state.hoveredStreetId = null;
        persistProgress();
        renderInterface();
        fitLearningSelection();
    }

    function setMode(mode) {
        var nextMode = mode === 'learning' ? 'learning' : 'quiz';
        if (state.mode === nextMode && state.loaded) {
            return;
        }
        clearAnswerTimer();
        closeStreetTooltips();
        state.mode = nextMode;
        state.selectedStreetId = null;
        state.hoveredStreetId = null;
        if (state.loaded) {
            persistProgress();
            renderInterface();
            window.requestAnimationFrame(function () {
                map.invalidateSize({ animate: false });
                if (state.mode === 'learning') {
                    fitLearningSelection();
                } else {
                    fitQuizSelection();
                }
            });
        }
    }

    function fitQuizSelection() {
        if (!state.loaded || state.mode !== 'quiz') {
            return;
        }

        var bounds = state.fullBounds;
        if (state.quizDistrictId) {
            var layer = state.districtLayers.get(state.quizDistrictId);
            if (layer && typeof layer.getBounds === 'function') {
                bounds = layer.getBounds();
            }
        }
        if (bounds && bounds.isValid()) {
            map.fitBounds(bounds, {
                padding: [18, 18],
                animate: false
            });
        }
    }

    function fitLearningSelection() {
        if (!state.loaded || state.mode !== 'learning') {
            return;
        }
        var bounds = window.L.latLngBounds([]);
        if (state.learningDistrictIds.size === 0) {
            bounds = state.fullBounds;
        } else {
            state.learningDistrictIds.forEach(function (districtId) {
                var layer = state.districtLayers.get(districtId);
                if (layer && typeof layer.getBounds === 'function') {
                    bounds.extend(layer.getBounds());
                }
            });
        }
        if (bounds && bounds.isValid()) {
            map.fitBounds(bounds, {
                padding: [18, 18],
                animate: false
            });
        }
    }

    function closeStreetTooltips() {
        state.streetLayers.forEach(function (layer) {
            if (typeof layer.closeTooltip === 'function') {
                layer.closeTooltip();
            }
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
        emptyOption.textContent = 'Выберите объект';
        elements.mapStreetSelect.append(emptyOption);

        getQuizScopeStreets().forEach(function (street) {
            var option = document.createElement('option');
            option.value = street.id;
            option.textContent = street.name;
            elements.mapStreetSelect.append(option);
        });
        state.streetPickerBuilt = true;
    }

    function renderInterface(options) {
        var quizProgress = getQuizProgress();
        var guessedCount = quizProgress.guessedCount;
        var total = quizProgress.total;
        var percentage = core.formatPercentage(guessedCount, total);
        var isLearning = state.mode === 'learning';
        var district = state.districtById.get(state.quizDistrictId);

        elements.progress.max = Math.max(total, 1);
        elements.progress.value = guessedCount;
        elements.progress.textContent = percentage;
        elements.progressText.textContent =
            guessedCount + ' / ' + total + ' · ' + percentage;

        elements.panel.hidden = isLearning;
        elements.actions.hidden = isLearning;
        elements.learningControls.hidden = !isLearning;
        elements.districtsSection.hidden = isLearning || !state.loaded;
        elements.quizDistrictSelect.disabled = !state.loaded || isLearning;
        elements.quizDistrictSelect.value = state.quizDistrictId;
        elements.allowShortAnswers.disabled =
            !state.loaded || state.complete || isLearning;
        elements.allowShortAnswers.checked = state.allowShortAnswers;
        elements.modeQuiz.classList.toggle('is-active', !isLearning);
        elements.modeLearning.classList.toggle('is-active', isLearning);
        elements.modeQuiz.setAttribute('aria-pressed', String(!isLearning));
        elements.modeLearning.setAttribute('aria-pressed', String(isLearning));

        elements.input.disabled = !state.loaded || state.complete || isLearning;
        elements.toggleMissing.disabled = !state.loaded || state.complete || isLearning;
        elements.toggleMissing.setAttribute('aria-pressed', String(state.showMissing));
        elements.toggleMissing.textContent = state.showMissing ?
            'Скрыть оставшиеся' :
            'Показать оставшиеся';
        elements.reset.disabled = !state.loaded || guessedCount === 0 || isLearning;
        elements.complete.hidden = !state.complete || isLearning;
        elements.completeTitle.textContent = district ?
            'Все объекты района названы' :
            'Все объекты названы';
        elements.completeCopy.textContent = district ?
            'Теперь названия улиц и мостов этого района доступны прямо на карте.' :
            'Теперь названия всех улиц и мостов доступны прямо на карте.';
        if (state.complete && !state.streetPickerBuilt) {
            buildStreetPicker();
        }
        elements.mapStreetPicker.hidden = !state.complete || isLearning;
        elements.map.classList.toggle('is-complete', state.complete && !isLearning);
        elements.map.classList.toggle('is-learning', isLearning);

        if (!isLearning && options && options.streetId) {
            renderDistrictCard(
                state.quizDistrictId ||
                    state.streetById.get(options.streetId).quizDistrictId
            );
        } else if (!isLearning) {
            renderDistrictCards();
        }
        refreshAllStreetStyles();
        updateMapStreetLabel();
    }

    function renderDistrictCards() {
        state.districts.forEach(function (district) {
            var card = state.districtCards.get(district.id);
            var visible = !state.quizDistrictId || state.quizDistrictId === district.id;
            card.root.hidden = !visible;
            if (visible) {
                renderDistrictCard(district.id);
            }
        });
        elements.districtsDescription.textContent = state.quizDistrictId ?
            'Учитываются все улицы и мосты, пересекающие выбранный район.' :
            'Каждый объект учитывается в одном основном районе.';
    }

    function renderDistrictCard(districtId) {
        var district = state.districtById.get(districtId);
        var card = state.districtCards.get(districtId);
        var streets = state.quizDistrictId === districtId ?
            state.streets.filter(function (street) {
                return core.streetMatchesQuizDistrict(street, districtId);
            }) :
            state.streetsByDistrict.get(districtId);
        var guessedStreets = streets.filter(function (street) {
            return state.guessedIds.has(street.id);
        });
        var guessedCount = guessedStreets.length;
        var showAll = state.complete;
        var visibleStreets = showAll ? streets : guessedStreets;
        var percentage = core.formatPercentage(guessedCount, streets.length);

        card.count.textContent =
            guessedCount + ' / ' + streets.length + ' · ' + percentage;
        card.progress.max = Math.max(streets.length, 1);
        card.progress.value = guessedCount;
        card.root.setAttribute(
            'aria-label',
            district.name + ': ' + guessedCount + ' из ' + streets.length +
            ', ' + percentage
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
        if (activeStreetId &&
            state.streetById.has(activeStreetId) &&
            canInspectStreet(activeStreetId)) {
            var street = state.streetById.get(activeStreetId);
            var districtNames = street.districtIds.map(function (districtId) {
                var district = state.districtById.get(districtId);
                return district ? district.name : districtId;
            });
            elements.mapStreetLabel.textContent = street.name +
                (districtNames.length ? ' — ' + districtNames.join(', ') : '');
            return;
        }
        if (state.mode === 'learning') {
            elements.mapStreetLabel.textContent =
                'Наведите курсор на объект, чтобы увидеть его название.';
            return;
        }
        if (state.showMissing && !state.complete) {
            elements.mapStreetLabel.textContent =
                'Оставшиеся объекты выделены пунктиром; названия по-прежнему скрыты.';
            return;
        }
        if (state.complete || getQuizProgress().guessedCount) {
            elements.mapStreetLabel.textContent =
                'Наведите курсор на угаданный объект, чтобы увидеть его название.';
            return;
        }
        elements.mapStreetLabel.textContent =
            'Угаданные улицы и мосты будут выделены чёрным.';
    }

    function persistProgress() {
        var saved = core.saveProgress(
            state.storage,
            state.datasetVersion,
            state.guessedIds,
            state.showMissing,
            state.mode,
            state.learningDistrictIds,
            state.quizDistrictId,
            state.allowShortAnswers
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
        elements.districtsSection.hidden =
            isLoading || !state.loaded || state.mode === 'learning';

        if (isLoading) {
            elements.input.disabled = true;
            elements.quizDistrictSelect.disabled = true;
            elements.allowShortAnswers.disabled = true;
            elements.toggleMissing.disabled = true;
            elements.reset.disabled = true;
            setFeedback('Загружаю карту и список объектов…', 'neutral');
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
            'Не удалось прочитать локальный набор объектов. Проверьте соединение и попробуйте ещё раз.';
        elements.retry.disabled = false;
        elements.input.disabled = true;
        elements.quizDistrictSelect.disabled = true;
        elements.allowShortAnswers.disabled = true;
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
