var buttonUp = document.querySelector('.buttonup');

function scrollToTop() {
    var scrollTop = window.scrollY || window.pageYOffset || document.documentElement.scrollTop;
    if (scrollTop > 0) {
        var scrollSpeed = scrollTop / 20; // Регулируем делитель для настройки замедления
        window.scrollTo(0, scrollTop - scrollSpeed);
        setTimeout(scrollToTop, 16);
    }
}

buttonUp.addEventListener('click', function(event) {
    event.preventDefault();
    scrollToTop();
});