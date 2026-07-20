/* ============================================================
   TokenBase — interactions
   ============================================================ */
(function () {
  "use strict";

  /* ---- Mobile nav toggle ---- */
  var burger = document.getElementById("navBurger");
  var links = document.getElementById("navLinks");
  if (burger && links) {
    burger.addEventListener("click", function () {
      var open = links.classList.toggle("open");
      burger.setAttribute("aria-expanded", open ? "true" : "false");
    });
    links.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        links.classList.remove("open");
        burger.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ---- FAQ accordion ---- */
  var faqs = document.querySelectorAll(".faq__item");
  faqs.forEach(function (item) {
    var q = item.querySelector(".faq__q");
    var a = item.querySelector(".faq__a");
    q.addEventListener("click", function () {
      var isOpen = item.classList.contains("open");
      // close others (optional — keeps it tidy)
      faqs.forEach(function (other) {
        other.classList.remove("open");
        other.querySelector(".faq__a").style.maxHeight = null;
      });
      if (!isOpen) {
        item.classList.add("open");
        a.style.maxHeight = a.scrollHeight + "px";
      }
    });
  });

  /* ---- Copy code button ---- */
  var copyBtn = document.querySelector(".copybtn");
  if (copyBtn) {
    copyBtn.addEventListener("click", function () {
      var target = document.getElementById("copyTarget");
      if (!target) return;
      var text = target.innerText;
      navigator.clipboard.writeText(text).then(function () {
        var old = copyBtn.textContent;
        copyBtn.textContent = "Copied!";
        setTimeout(function () { copyBtn.textContent = old; }, 1600);
      });
    });
  }

  /* ---- Scroll reveal ---- */
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }

  /* ---- Nav shadow on scroll ---- */
  var nav = document.getElementById("nav");
  if (nav) {
    window.addEventListener("scroll", function () {
      if (window.scrollY > 8) nav.style.boxShadow = "0 6px 20px rgba(13,18,34,.06)";
      else nav.style.boxShadow = "none";
    });
  }
})();
