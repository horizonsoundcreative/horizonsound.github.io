document.addEventListener("DOMContentLoaded", () => {
  const carousels = document.querySelectorAll("[data-carousel]");

  carousels.forEach(carousel => {
    const strip = carousel.querySelector("[data-strip]");
    const left = carousel.querySelector('[data-arrow="left"]');
    const right = carousel.querySelector('[data-arrow="right"]');

    if (!strip || !left || !right) return;

    const updateArrows = () => {
      const maxScroll = strip.scrollWidth - strip.clientWidth;
      left.classList.toggle("disabled", strip.scrollLeft <= 0);
      right.classList.toggle("disabled", strip.scrollLeft >= maxScroll - 1);
    };

    left.addEventListener("click", () => {
      strip.scrollBy({ left: -300, behavior: "smooth" });
      setTimeout(updateArrows, 350);
    });

    right.addEventListener("click", () => {
      strip.scrollBy({ left: 300, behavior: "smooth" });
      setTimeout(updateArrows, 350);
    });

    strip.addEventListener("scroll", updateArrows);

    updateArrows();
  });
});
