(function () {
    "use strict";

    // Keep every WhatsApp link pointing at the number configured in config.js (when loaded).
    if (typeof CONFIG !== "undefined" && CONFIG.WHATSAPP_PHONE) {
        document.querySelectorAll("a[data-whatsapp]").forEach(function (link) {
            link.href = "https://wa.me/" + CONFIG.WHATSAPP_PHONE;
        });
    }

    var toggle = document.querySelector(".menu-toggle");
    var nav = document.getElementById("menu-principal");
    if (!toggle || !nav) return;

    var mobileQuery = window.matchMedia("(max-width: 1024px)");

    function isOpen() {
        return toggle.getAttribute("aria-expanded") === "true";
    }

    function setOpen(open, returnFocus) {
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
    }

    toggle.addEventListener("click", function () {
        setOpen(!isOpen(), false);
    });

    nav.addEventListener("click", function (event) {
        if (event.target.closest("a") && isOpen()) setOpen(false, false);
    });

    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && isOpen()) setOpen(false, true);
    });

    document.addEventListener("click", function (event) {
        if (isOpen() && !nav.contains(event.target) && !toggle.contains(event.target)) {
            setOpen(false, false);
        }
    });

    // Keep Tab focus inside the open mobile menu (toggle + links).
    nav.addEventListener("keydown", function (event) {
        if (event.key !== "Tab" || !isOpen()) return;
        var links = nav.querySelectorAll("a");
        var last = links[links.length - 1];
        if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            toggle.focus();
        }
    });

    function onViewportChange(event) {
        if (!event.matches && isOpen()) setOpen(false, false);
    }
    if (mobileQuery.addEventListener) mobileQuery.addEventListener("change", onViewportChange);
    else if (mobileQuery.addListener) mobileQuery.addListener(onViewportChange);
})();
