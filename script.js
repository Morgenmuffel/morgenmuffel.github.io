document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("learn-more").addEventListener("click", () => {
      document.getElementById("about").scrollIntoView({ behavior: "smooth" });
  });

  document.getElementById("contact-form").addEventListener("submit", (e) => {
      e.preventDefault();
      alert("Message sent successfully!");
  });
});
