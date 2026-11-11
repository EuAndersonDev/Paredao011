// Parallax: layers move at different speeds while scrolling, with eased (smoothed) motion.
// Desktop with a mouse only, and never with prefers-reduced-motion. Only the `translate`
// property is changed, so there is no layout shift and content stays where it is without JS.
//   data-parallax="-0.2"        speed relative to the element's distance from the viewport centre
//   data-parallax-clamp="0.06"  optional limit, as a fraction of the frame height
(function () {
    "use strict";

    var query = window.matchMedia("(prefers-reduced-motion: no-preference) and (min-width: 1024px) and (pointer: fine)");
    var root = document.documentElement;
    var background = document.querySelector(".page-bg");
    var layers = Array.prototype.map.call(document.querySelectorAll("[data-parallax]"), function (el) {
        return {
            el: el,
            frame: el.closest("figure, section") || el.parentElement,
            speed: parseFloat(el.getAttribute("data-parallax")) || 0,
            clamp: parseFloat(el.getAttribute("data-parallax-clamp")) || 0,
            current: 0,
            target: 0
        };
    });
    var bg = { current: 0, target: 0 };
    var frame = 0;
    var active = false;
    var SMOOTHING = 0.12; // share of the remaining distance covered per frame (eases in and out)

    function measure() {
        var viewport = window.innerHeight;
        var scrollable = Math.max(1, root.scrollHeight - viewport);
        // Background drifts ±5% of the viewport over the whole page (the layer is scaled 1.12, so edges never show).
        bg.target = (window.scrollY / scrollable - 0.5) * -2 * viewport * 0.05;

        layers.forEach(function (layer) {
            var rect = layer.frame.getBoundingClientRect();
            if (rect.bottom < -viewport || rect.top > viewport * 2) return; // far off screen
            var offset = (rect.top + rect.height / 2 - viewport / 2) * layer.speed;
            if (layer.clamp) {
                var limit = rect.height * layer.clamp;
                offset = Math.max(-limit, Math.min(limit, offset));
            }
            layer.target = offset;
        });
    }

    function step(item, apply) {
        var delta = item.target - item.current;
        if (Math.abs(delta) < 0.05) {
            if (item.current !== item.target) {
                item.current = item.target;
                apply(item.current);
            }
            return false;
        }
        item.current += delta * SMOOTHING;
        apply(item.current);
        return true;
    }

    function tick() {
        frame = 0;
        if (!active) return;
        var moving = false;
        if (background) {
            moving = step(bg, function (y) { background.style.translate = "0 " + y.toFixed(2) + "px"; }) || moving;
        }
        layers.forEach(function (layer) {
            moving = step(layer, function (y) { layer.el.style.translate = "0 " + y.toFixed(2) + "px"; }) || moving;
        });
        if (moving) frame = requestAnimationFrame(tick);
    }

    function onScroll() {
        if (!active) return;
        measure();
        if (!frame) frame = requestAnimationFrame(tick);
    }

    function setActive(on) {
        active = on;
        root.classList.toggle("parallax-on", on);
        if (on) {
            // Start at the right positions (no easing on load), then follow the scroll.
            measure();
            bg.current = bg.target;
            if (background) background.style.translate = "0 " + bg.current.toFixed(2) + "px";
            layers.forEach(function (layer) {
                layer.current = layer.target;
                layer.el.style.translate = "0 " + layer.current.toFixed(2) + "px";
            });
        } else {
            cancelAnimationFrame(frame);
            frame = 0;
            if (background) background.style.translate = "";
            layers.forEach(function (layer) { layer.el.style.translate = ""; });
        }
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    var onChange = function () { setActive(query.matches); };
    if (query.addEventListener) query.addEventListener("change", onChange);
    else if (query.addListener) query.addListener(onChange);
    setActive(query.matches);
})();
