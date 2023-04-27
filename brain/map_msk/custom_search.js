function init() {
    var myMap = new ymaps.Map('map', {
            center: [55.7, 37.5],
            zoom: 9,
            controls: ['zoomControl']
        }),
    // Создаем коллекцию.
        myCollection = new ymaps.GeoObjectCollection(),
    // Создаем массив с данными.
        myPoints = [
            { coords: [55.760152, 37.649001], text: 'улица Покровка' },
            { coords: [55.769428, 37.595303], text: 'Триумфальная площадь' },
            { coords: [55.771388, 37.601034], text: 'Садовая-Триумфальная улица' },
            { coords: [55.772988, 37.608454], text: 'Садовая-Каретная улица' },
            { coords: [55.773722, 37.616629], text: 'Садовая-Самотёчная улица' },
            { coords: [55.773793, 37.620366], text: 'Самотёчная площадь' },
            { coords: [55.773505, 37.624211], text: 'Садовая-Сухаревская улица' },
            { coords: [55.773099, 37.630023], text: 'Малая Сухаревская площадь' },
            { coords: [55.772299, 37.634317], text: 'Большая Сухаревская площадь' },
            { coords: [55.770289, 37.644001], text: 'Садовая-Спасская улица' },
            { coords: [55.768704, 37.648906], text: 'Площадь Красные Ворота ' },
            { coords: [55.769504, 37.651565], text: 'Лермонтовская площадь' },
            { coords: [55.766613, 37.652400], text: 'Садовая-Черногрязская улица' },
            { coords: [55.764268, 37.656128], text: 'Площадь Земляной Вал' },
            { coords: [55.763903, 37.655176], text: 'площадь Цезаря Куникова' },
            { coords: [55.753306, 37.656236], text: 'Улица Земляной Вал' },
            { coords: [55.757622, 37.659730], text: 'площадь Курского Вокзала' },
            { coords: [55.741135, 37.653721], text: 'Таганская площадь' },
            { coords: [55.734658, 37.643911], text: 'Нижняя Краснохолмская улица' },
            { coords: [55.731876, 37.638943], text: 'Улица Зацепский Вал' },
            { coords: [55.730867, 37.638773], text: 'Павелецкая площадь' },
            { coords: [55.730497, 37.631020], text: 'Валовая улица' },
            { coords: [55.729138, 37.624633], text: 'Серпуховская площадь' },
            { coords: [55.729179, 37.618920], text: 'Улица Коровий Вал' },
            { coords: [55.730096, 37.618057], text: 'Житная улица' },
            { coords: [55.731749, 37.606164], text: 'Улица Крымский Вал' },
            { coords: [55.729447, 37.612928], text: 'Калужская площадь' },
            { coords: [55.735697, 37.593336], text: 'Крымская площадь' },
            { coords: [55.737010, 37.590201], text: 'Зубовский бульвар' },
            { coords: [55.738510, 37.585538], text: 'Зубовская площадь' },
            { coords: [55.742098, 37.584532], text: 'Смоленский бульвар' },
            { coords: [55.745960, 37.581963], text: 'Смоленская-Сенная площадь' },
            { coords: [55.747890, 37.582718], text: 'Смоленская площадь' },
            { coords: [55.753433, 37.583580], text: 'Новинский бульвар' },
            { coords: [55.758762, 37.582924], text: 'Кудринская площадь' },
            { coords: [55.758762, 37.582924], text: 'Садовая-Кудринская улица' },
            { coords: [55.767423, 37.593048], text: 'Большая Садовая улица' }
        ];

    // Заполняем коллекцию данными.
    for (var i = 0, l = myPoints.length; i < l; i++) {
        var point = myPoints[i];
        myCollection.add(new ymaps.Placemark(
            point.coords, {
                balloonContentBody: point.text
            }
        ));
    }

    // Добавляем коллекцию меток на карту.
    myMap.geoObjects.add(myCollection);

    // Создаем экземпляр класса ymaps.control.SearchControl
    var mySearchControl = new ymaps.control.SearchControl({
        options: {
            // Заменяем стандартный провайдер данных (геокодер) нашим собственным.
            provider: new CustomSearchProvider(myPoints),
            // Не будем показывать еще одну метку при выборе результата поиска,
            // т.к. метки коллекции myCollection уже добавлены на карту.
            noPlacemark: true,
            resultsPerPage: 5
        }});

    // Добавляем контрол в верхний правый угол,
    myMap.controls
        .add(mySearchControl, { float: 'right' });
}


// Провайдер данных для элемента управления ymaps.control.SearchControl.
// Осуществляет поиск геообъектов в по массиву points.
// Реализует интерфейс IGeocodeProvider.
function CustomSearchProvider(points) {
    this.points = points;
}

// Провайдер ищет по полю text стандартным методом String.ptototype.indexOf.
CustomSearchProvider.prototype.geocode = function (request, options) {
    var deferred = new ymaps.vow.defer(),
        geoObjects = new ymaps.GeoObjectCollection(),
    // Сколько результатов нужно пропустить.
        offset = options.skip || 0,
    // Количество возвращаемых результатов.
        limit = options.results || 20;
        
    var points = [];
    // Ищем в свойстве text каждого элемента массива.
    for (var i = 0, l = this.points.length; i < l; i++) {
        var point = this.points[i];
        if (point.text.toLowerCase().indexOf(request.toLowerCase()) != -1) {
            points.push(point);
        }
    }
    // При формировании ответа можно учитывать offset и limit.
    points = points.splice(offset, limit);
    // Добавляем точки в результирующую коллекцию.
    for (var i = 0, l = points.length; i < l; i++) {
        var point = points[i],
            coords = point.coords,
                    text = point.text;

        geoObjects.add(new ymaps.Placemark(coords, {
            name: text + ' name',
            description: text + ' description',
            balloonContentBody: '<p>' + text + '</p>',
            boundedBy: [coords, coords]
        }));
    }

    deferred.resolve({
        // Геообъекты поисковой выдачи.
        geoObjects: geoObjects,
        // Метаинформация ответа.
        metaData: {
            geocoder: {
                // Строка обработанного запроса.
                request: request,
                // Количество найденных результатов.
                found: geoObjects.getLength(),
                // Количество возвращенных результатов.
                results: limit,
                // Количество пропущенных результатов.
                skip: offset
            }
        }
    });

    // Возвращаем объект-обещание.
    return deferred.promise();
};

ymaps.ready(init);

