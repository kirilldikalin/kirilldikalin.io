var buttonUp = document.querySelector('.buttonup');

function scrollToTop() {
    var startY = window.scrollY || window.scrollY || document.documentElement.scrollTop;
    var distance = startY;
    if (distance < 10) {
        window.scrollTo(0, 0);
        return;
    }
    var speed = Math.round(distance / 100);
    if (speed >= 20) speed = 20;
    var step = Math.round(distance / 25);
    var leapY = startY - step;
    var scrollInterval = setInterval(function() {
        window.scrollTo(0, leapY);
        leapY -= step;
        if (leapY <= 0) {
            clearInterval(scrollInterval);
            window.scrollTo(0, 0);
        }
    }, speed);
}

buttonUp.addEventListener('click', function(event) {
    event.preventDefault();
    scrollToTop();
});


// Замедление кверху

// var buttonUp = document.querySelector('.buttonup');

// function scrollToTop() {
//     var scrollTop = window.scrollY || window.scrollY || document.documentElement.scrollTop;
//     if (scrollTop > 1) {
//         var scrollSpeed = scrollTop / 20; // Регулируем делитель для настройки замедления
//         window.scrollTo(0, scrollTop - scrollSpeed);
//         setTimeout(scrollToTop, 16);
//     }
// }

// buttonUp.addEventListener('click', function(event) {
//     event.preventDefault();
//     scrollToTop();
// });