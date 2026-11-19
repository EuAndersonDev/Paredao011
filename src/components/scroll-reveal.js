// Scroll reveal: fades sections in, scrolling down or up. Only runs with JS and without reduced motion,
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

    // Works both ways: scrolling down, elements rise from below; scrolling up, they come down
    // from above. When an element leaves the screen it resets, so it animates again next time.
    // Elements revealed with clip-path (section titles) are fully clipped while hidden, and the
    // browser then never reports them as intersecting. For those we observe the parent block
    // instead and apply the result to the element.
    var watched = new Map(); // observed element -> elements to update
    targets.forEach(function (el) {
        var trigger = el.tagName === "H2" && el.parentElement ? el.parentElement : el;
        if (!watched.has(trigger)) watched.set(trigger, []);
        watched.get(trigger).push(el);
    });

    var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            watched.get(entry.target).forEach(function (el) {
                if (entry.isIntersecting) {
                    el.classList.add("is-visible");
                } else {
                    // Left above the viewport -> next entry comes from above (scrolling up).
                    el.classList.toggle("from-above", entry.boundingClientRect.top < 0);
                    el.classList.remove("is-visible");
                }
            });
        });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });

    watched.forEach(function (_, trigger) { observer.observe(trigger); });
})();
