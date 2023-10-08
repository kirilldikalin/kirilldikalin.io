var buttonDown = document.querySelector('.buttondown');

function scrollToBottom() {
    var startY = window.scrollY || window.scrollY || document.documentElement.scrollTop;
    var stopY = document.documentElement.scrollHeight - window.innerHeight;
    var distance = stopY > startY ? stopY - startY : startY - stopY;
    if (distance < 100) {
        window.scrollTo(0, stopY);
        return;
    }
    var speed = Math.round(distance / 100);
    if (speed >= 20) speed = 20;
    var step = Math.round(distance / 25);
    var leapY = stopY > startY ? startY + step : startY - step;
    var timer = 0;
    if (stopY > startY) {
        for (var i = startY; i < stopY; i += step) {
            setTimeout("window.scrollTo(0, " + leapY + ")", timer * speed);
            leapY += step;
            if (leapY > stopY) leapY = stopY;
            timer++;
        }
        return;
    }
    for (var i = startY; i > stopY; i -= step) {
        setTimeout("window.scrollTo(0, " + leapY + ")", timer * speed);
        leapY -= step;
        if (leapY < stopY) leapY = stopY;
        timer++;
    }
    return false;
}

buttonDown.addEventListener('click', function(event) {
    event.preventDefault();
    scrollToBottom();
});
