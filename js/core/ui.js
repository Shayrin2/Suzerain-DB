// js/core/ui.js
// Shared UI helpers

(function () {
  function initBackToTop() {
    if (!document.body) return;
    const existing = document.querySelector(".back-to-top");
    if (existing) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "back-to-top";
    btn.textContent = "↑ Top";
    btn.setAttribute("aria-label", "Back to top");

    btn.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    function toggle() {
      const shouldShow = window.scrollY > 200;
      btn.classList.toggle("back-to-top--visible", shouldShow);
    }

    window.addEventListener("scroll", toggle, { passive: true });
    toggle();

    document.body.appendChild(btn);
  }

  document.addEventListener("DOMContentLoaded", initBackToTop);
})();
