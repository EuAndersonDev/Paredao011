// Visual effects for the simulator. Read-only with respect to app.js: it only observes the DOM
// that app.js updates (status message and total) and never changes inputs, values or links.
(function () {
    "use strict";

    var button = document.getElementById("btn-calcular");
    var status = document.getElementById("status");
    var total = document.getElementById("res-total");
    if (!button || !status || !total) return;

    // Loading state on "Calcular": app.js disables the button and shows a "loading" status
    // while the request runs (the status text itself is not cleared after success).
    var syncLoading = function () {
        var loading = button.disabled && status.classList.contains("loading");
        button.classList.toggle("is-loading", loading);
        if (loading) button.setAttribute("aria-busy", "true");
        else button.removeAttribute("aria-busy");
    };
    var loadingObserver = new MutationObserver(syncLoading);
    loadingObserver.observe(status, { attributes: true, attributeFilter: ["class"] });
    loadingObserver.observe(button, { attributes: true, attributeFilter: ["disabled"] });

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Count-up: an aria-hidden overlay animates to the value app.js wrote into #res-total.
    // The real element always holds the final text, so results and screen readers are unaffected.
    var formatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
    var overlay = null;
    var frame = 0;
    var lastValue = null;

    var parseBRL = function (text) {
        var digits = text.replace(/[^\d,]/g, "").replace(",", ".");
        var value = parseFloat(digits);
        return /R\$/.test(text) && isFinite(value) ? value : null;
    };

    var stop = function () {
        cancelAnimationFrame(frame);
        total.classList.remove("is-counting");
        if (overlay) overlay.remove();
        overlay = null;
    };

    var animateTo = function (from, target) {
        stop();
        overlay = document.createElement("div");
        overlay.className = "count-up";
        overlay.setAttribute("aria-hidden", "true");
        overlay.style.top = total.offsetTop + "px";
        overlay.style.bottom = "auto";
        total.parentNode.appendChild(overlay);
        total.classList.add("is-counting");

        var duration = from ? 450 : 900;
        var start = performance.now();
        var tick = function (now) {
            var t = Math.min((now - start) / duration, 1);
            var eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // ease-in-out
            overlay.textContent = formatter.format(from + (target - from) * eased);
            if (t < 1) frame = requestAnimationFrame(tick);
            else stop();
        };
        frame = requestAnimationFrame(tick);
    };

    new MutationObserver(function () {
        var value = parseBRL(total.textContent);
        if (value === null) {
            stop();
            lastValue = null;
            return;
        }
        if (value !== lastValue) animateTo(lastValue || 0, value);
        lastValue = value;
    }).observe(total, { childList: true, characterData: true, subtree: true });
})();
