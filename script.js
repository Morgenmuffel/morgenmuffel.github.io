document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("learn-more").addEventListener("click", () => {
      document.getElementById("about").scrollIntoView({ behavior: "smooth" });
  });

  document.getElementById("contact-form").addEventListener("submit", (e) => {
      e.preventDefault();
      alert("Message sent successfully!");
  });
});
document.querySelectorAll('.project-item').forEach(item => {
  const description = item.querySelector('.description');
  const descriptionHeight = description.offsetHeight; // Get the height of the description
  const projectName = item.querySelector('.project-name');

  item.addEventListener('mouseenter', () => {
    projectName.style.transform = `translateY(calc(-${descriptionHeight}px))`;
  });

  item.addEventListener('mouseleave', () => {
    projectName.style.transform = 'translateY(0)';
  });
});
