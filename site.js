(function () {
    "use strict";

    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Keep every WhatsApp link pointing at the number configured in config.js (when loaded).
    if (typeof CONFIG !== "undefined" && CONFIG.WHATSAPP_PHONE) {
        document.querySelectorAll("a[data-whatsapp]").forEach(function (link) {
            link.href = "https://wa.me/" + CONFIG.WHATSAPP_PHONE;
        });
    }

    /* ---------- Hamburger menu ---------- */
    var toggle = document.querySelector(".menu-toggle");
    var nav = document.getElementById("menu-principal");

    if (toggle && nav) {
        var mobileQuery = window.matchMedia("(max-width: 1024px)");
        var isOpen = function () { return toggle.getAttribute("aria-expanded") === "true"; };

        var setOpen = function (open, returnFocus) {
            toggle.setAttribute("aria-expanded", String(open));
            toggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
            nav.classList.toggle("is-open", open);
            document.body.classList.toggle("menu-open", open);
            if (open) {
                var first = nav.querySelector("a");
                if (first) first.focus();
            } else if (returnFocus) {
                toggle.focus();
            }
        };

        toggle.addEventListener("click", function () { setOpen(!isOpen(), false); });

        nav.addEventListener("click", function (event) {
            if (event.target.closest("a") && isOpen()) setOpen(false, false);
        });

        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && isOpen()) setOpen(false, true);
        });

        document.addEventListener("click", function (event) {
            if (isOpen() && !nav.contains(event.target) && !toggle.contains(event.target)) setOpen(false, false);
        });

        // Keep Tab focus inside the open mobile menu (toggle + links).
        nav.addEventListener("keydown", function (event) {
            if (event.key !== "Tab" || !isOpen()) return;
            var links = nav.querySelectorAll("a");
            if (!event.shiftKey && document.activeElement === links[links.length - 1]) {
                event.preventDefault();
                toggle.focus();
            }
        });

        var onViewportChange = function (event) {
            if (!event.matches && isOpen()) setOpen(false, false);
        };
        if (mobileQuery.addEventListener) mobileQuery.addEventListener("change", onViewportChange);
        else if (mobileQuery.addListener) mobileQuery.addListener(onViewportChange);
    }

    /* ---------- Scroll reveal (runs once per element) ---------- */
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
