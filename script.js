document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("learn-more").addEventListener("click", () => {
      document.getElementById("about").scrollIntoView({ behavior: "smooth" });
  });

  document.getElementById("contact-form").addEventListener("submit", (e) => {
      e.preventDefault();
      alert("Message sent successfully!");
  });

  document.querySelectorAll('.project-item').forEach(item => {
    const description = item.querySelector('.description');
    const descriptionHeight = description.offsetHeight;
    const projectName = item.querySelector('.project-name');

    item.addEventListener('mouseenter', () => {
      projectName.style.transform = `translateY(calc(-${descriptionHeight}px))`;
    });

    item.addEventListener('mouseleave', () => {
      projectName.style.transform = 'translateY(0)';
    });
  });
});
document.addEventListener("DOMContentLoaded", function () {
  const carousel = document.querySelector("#projectCarousel .carousel-inner");
  const items = document.querySelectorAll("#projectCarousel .carousel-item");
  const prevButton = document.querySelector(".carousel-control-prev");
  const nextButton = document.querySelector(".carousel-control-next");

  let currentIndex = 0;
  let itemsPerView = getItemsPerView();

  function getItemsPerView() {
    if (window.innerWidth < 480) return 1;
    if (window.innerWidth < 768) return 2;
    if (window.innerWidth < 1024) return 3;
    return 4;
  }

  function updateCarousel() {
    let newTransform = `translateX(-${currentIndex * (100 / itemsPerView)}%)`;
    carousel.style.transform = newTransform;
  }

  function moveNext() {
    if (currentIndex < items.length - itemsPerView) {
      currentIndex++;
    } else {
      currentIndex = 0;
    }
    updateCarousel();
  }

  function movePrev() {
    if (currentIndex > 0) {
      currentIndex--;
    } else {
      currentIndex = items.length - itemsPerView;
    }
    updateCarousel();
  }

  prevButton.addEventListener("click", movePrev);
  nextButton.addEventListener("click", moveNext);

  window.addEventListener("resize", function () {
    itemsPerView = getItemsPerView();
    updateCarousel();
  });

  updateCarousel(); // Initialize
});
