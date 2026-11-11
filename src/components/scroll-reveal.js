// Scroll reveal: fades sections in once. Only runs with JS and without reduced motion,
// and never hides what is already on screen, so content stays visible and indexable.
(function () {
    "use strict";

    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || !("IntersectionObserver" in window)) return;

    var groups = document.querySelectorAll("[data-reveal-group]");
    var singles = document.querySelectorAll("[data-reveal]");
    var targets = [];
    var viewportBottom = window.innerHeight;

    var prepare = function (el, delay) {
        // Never hide what is already on screen: avoids a flash and keeps LCP untouched.
        if (el.getBoundingClientRect().top < viewportBottom) return;
        el.style.setProperty("--reveal-delay", delay + "ms");
        el.classList.add("reveal");
        targets.push(el);
    };

    singles.forEach(function (el) { prepare(el, 0); });
    groups.forEach(function (group) {
        Array.prototype.forEach.call(group.children, function (child, index) {
            prepare(child, Math.min(index, 6) * 80);
        });
    });

    var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
        });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });

    targets.forEach(function (el) { observer.observe(el); });
})();
