// Функция для плавной прокрутки наверх страницы
function scrollToTop() {
    var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    if (scrollTop > 0) {
      // Если еще не достигли верха страницы, анимированно прокручиваем вверх
      window.scrollTo(0, scrollTop - 500); // Уменьшаем scrollTop на 50 на каждом шаге
      requestAnimationFrame(scrollToTop); // Рекурсивно вызываем функцию
    } else {
      // Когда достигли верха страницы, останавливаем анимацию
      cancelAnimationFrame(scrollToTop);
    }
  }