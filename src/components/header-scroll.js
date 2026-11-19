// Two small helpers. 1) Header steps out of the way while scrolling down and comes back when scrolling up
// (more room for the content, especially on phones). Uses a body class; the CSS moves the
// header with `translate` only. It never hides while the menu is open, while focus is in
// the header, or near the top of the page. Off with prefers-reduced-motion.
(function () {
    "use strict";

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var header = document.querySelector(".site-header");
    if (!header) return;

    var lastY = window.scrollY;
    var frame = 0;
    var hidden = false;
    var THRESHOLD = 8; // px of movement before reacting, avoids flicker

    function setHidden(value) {
        if (value === hidden) return;
        hidden = value;
        document.body.classList.toggle("header-hidden", hidden);
    }

    function update() {
        frame = 0;
        var y = window.scrollY;
        var delta = y - lastY;
        if (Math.abs(delta) < THRESHOLD) return;
        var busy = document.body.classList.contains("menu-open") || header.contains(document.activeElement);
        setHidden(!busy && delta > 0 && y > header.offsetHeight * 3);
        lastY = y;
    }

    window.addEventListener("scroll", function () {
        if (!frame) frame = requestAnimationFrame(update);
    }, { passive: true });
    header.addEventListener("focusin", function () { setHidden(false); });
})();

// Floating WhatsApp button: hidden while a block that already has WhatsApp/quote buttons is on
// screen (hero, final call to action, footer), so it never covers those buttons.
(function () {
    "use strict";

    var blocks = document.querySelectorAll("[data-fab-hide]");
    if (!blocks.length || !("IntersectionObserver" in window)) return;
    var visible = new Set();
    var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) visible.add(entry.target);
            else visible.delete(entry.target);
        });
        document.body.classList.toggle("fab-hide", visible.size > 0);
    }, { threshold: 0.15 });
    blocks.forEach(function (block) { observer.observe(block); });
})();
