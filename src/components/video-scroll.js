// Scroll-driven video section.
// 1. Entering the section, the video grows from a card to the full screen as you scroll.
// 2. Each further "screen" of scrolling shows the next video, playing its silent 5 s preview.
// 3. "Ver vídeo completo" (or a tap on the video) plays the full video with sound; when it
//    ends, the page scrolls to the next video.
// Only transform/opacity are animated. Without JS or with prefers-reduced-motion the section
// is a plain list of videos with native controls (see the CSS), and this script only sets posters.
(function () {
    "use strict";

    var root = document.querySelector("[data-video-scroll]");
    if (!root) return;

    var slides = Array.prototype.slice.call(root.querySelectorAll(".vs-slide"));
    var backdrops = Array.prototype.slice.call(root.querySelectorAll(".vs-backdrop"));
    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var enhanced = !reduceMotion && "IntersectionObserver" in window && slides.length > 0;

    // Posters are set only when the visitor gets close, so they never compete with the top of the page.
    var postersSet = false;
    function setPosters() {
        if (postersSet) return;
        postersSet = true;
        slides.forEach(function (slide, i) {
            var video = slide.querySelector("video");
            var poster = video.getAttribute("data-poster");
            if (!poster) return;
            video.poster = poster;
            if (backdrops[i]) backdrops[i].style.backgroundImage = "url(\"" + poster + "\")";
        });
    }
    if ("IntersectionObserver" in window) {
        var near = new IntersectionObserver(function (entries) {
            if (!entries[0].isIntersecting) return;
            setPosters();
            near.disconnect();
        }, { rootMargin: "800px 0px" });
        near.observe(root);
    } else {
        setPosters();
    }
    if (!enhanced) return;

    // ---------- enhanced mode ----------
    var sticky = root.querySelector(".vs-sticky");
    var media = root.querySelector(".vs-media");
    var intro = root.querySelector(".vs-intro");
    var backdropWrap = root.querySelector(".vs-backdrops");
    var hud = root.querySelector(".vs-hud");
    var captionEl = root.querySelector("[data-hud-caption]");
    var counterEl = root.querySelector("[data-counter]");
    var fullButton = root.querySelector("[data-full]");
    var backButton = root.querySelector("[data-back]");
    var toggle = root.querySelector("[data-toggle]");
    var dotsWrap = root.querySelector(".vs-hud__dots");
    var status = root.querySelector("[data-status]");
    var header = document.querySelector(".site-header");
    var total = slides.length;
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };

    var index = -1;
    var autoplay = true;
    var onScreen = false;
    var immersive = false;
    var frame = 0;
    var geo = {};

    var items = slides.map(function (slide, i) {
        var video = slide.querySelector("video");
        var source = video.querySelector("source");
        var item = {
            slide: slide,
            video: video,
            full: source ? source.getAttribute("src") : video.getAttribute("src"),
            preview: slide.getAttribute("data-preview"),
            caption: slide.getAttribute("data-caption") || "",
            mode: "none" // "none" | "preview" | "full"
        };
        video.removeAttribute("controls");
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.preload = "none";
        video.addEventListener("click", function () {
            if (i === index && item.mode !== "full") playFull();
        });
        video.addEventListener("ended", function () {
            if (i === index && item.mode === "full") onFullEnded();
        });

        var dot = document.createElement("button");
        dot.type = "button";
        dot.className = "vs-hud__dot";
        dot.setAttribute("aria-label", "Vídeo " + (i + 1) + ": " + item.caption);
        dot.addEventListener("click", function () { scrollToSlide(i, true); });
        dotsWrap.appendChild(dot);
        item.dot = dot;
        return item;
    });

    root.classList.add("is-enhanced");
    hud.hidden = false;

    function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
    function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

    // ---------- media sources ----------
    function setSource(item, mode) {
        if (item.mode === mode) return;
        item.mode = mode;
        if (mode === "none") item.video.removeAttribute("src");
        else item.video.src = mode === "full" ? item.full : item.preview;
        item.video.load();
    }

    function safePlay(video) {
        var promise = video.play();
        if (promise && promise.catch) promise.catch(function () { /* autoplay blocked: the poster stays */ });
    }

    function startPreview() {
        var item = items[index];
        if (!item) return;
        root.classList.remove("is-full");
        backButton.hidden = true;
        item.video.controls = false;
        item.video.muted = true;
        item.video.loop = true;
        setSource(item, "preview");
        if (autoplay && onScreen && !document.hidden) {
            safePlay(item.video);
            var next = items[index + 1];
            if (next && next.mode === "none") {
                next.video.preload = "auto";
                setSource(next, "preview");
            }
        } else {
            item.video.pause();
        }
    }

    function playFull() {
        var item = items[index];
        setSource(item, "full");
        root.classList.add("is-full");
        backButton.hidden = false;
        item.video.loop = false;
        item.video.controls = true;
        item.video.muted = false;
        item.video.currentTime = 0;
        safePlay(item.video);
        backButton.focus({ preventScroll: true });
    }

    function exitFull() {
        var item = items[index];
        if (item && item.mode === "full") {
            item.video.pause();
            setSource(item, "none"); // stop downloading the full video
        }
        startPreview();
    }

    function onFullEnded() {
        exitFull();
        if (index < total - 1) scrollToSlide(index + 1, false);
        else scrollPastSection();
    }

    function activate(i, announce) {
        if (i === index) return;
        var previous = items[index];
        if (previous) {
            previous.video.pause();
            if (previous.mode === "full") setSource(previous, "none");
        }
        index = i;
        items.forEach(function (item, j) {
            var active = j === index;
            item.slide.classList.toggle("is-active", active);
            if (backdrops[j]) backdrops[j].classList.toggle("is-active", active);
            if (active) item.dot.setAttribute("aria-current", "true");
            else item.dot.removeAttribute("aria-current");
        });
        captionEl.textContent = items[index].caption;
        counterEl.textContent = pad(index + 1) + " / " + pad(total);
        if (announce) status.textContent = "Vídeo " + (index + 1) + " de " + total + ": " + items[index].caption;
        items[index].video.currentTime = 0;
        startPreview();
    }

    // ---------- geometry ----------
    function measure() {
        var vw = sticky.clientWidth;
        var vh = sticky.clientHeight;
        var ratio = 480 / 854;
        // Portrait screens: the video covers the whole screen. Landscape: full height, blurred sides.
        var portrait = vw / vh < 0.75;
        var mediaW = portrait ? vw : Math.round(vh * ratio);
        var mediaH = vh;
        var introBottom = intro.offsetTop + intro.offsetHeight;
        var room = Math.max(160, vh - introBottom - 24);
        var cardW = Math.min(380, vw - 32);
        var cardH = Math.min(room, cardW * mediaH / mediaW);
        geo = {
            vw: vw,
            vh: vh,
            mediaW: mediaW,
            startScale: cardH / mediaH,
            startY: introBottom + 12,
            expand: vh * 0.9
        };
        media.style.width = mediaW + "px";
        media.style.height = mediaH + "px";
        media.style.left = Math.round((vw - mediaW) / 2) + "px";
    }

    function segmentTop(i) {
        var top = window.scrollY + root.getBoundingClientRect().top;
        return top + geo.expand + i * geo.vh + 2;
    }

    function scrollToSlide(i, announce) {
        if (announce) status.textContent = "Vídeo " + (i + 1) + " de " + total + ": " + items[i].caption;
        window.scrollTo({ top: segmentTop(i), behavior: "smooth" });
    }

    function scrollPastSection() {
        var rect = root.getBoundingClientRect();
        window.scrollTo({ top: window.scrollY + rect.bottom - geo.vh * 0.5, behavior: "smooth" });
    }

    // ---------- per-frame update ----------
    function update() {
        frame = 0;
        var rect = root.getBoundingClientRect();
        var scrolled = -rect.top;
        var e = easeInOut(clamp(scrolled / geo.expand, 0, 1));

        var scale = geo.startScale + (1 - geo.startScale) * e;
        var y = geo.startY * (1 - e);
        media.style.transform = "translate3d(0," + y.toFixed(1) + "px,0) scale(" + scale.toFixed(4) + ")";
        media.style.borderRadius = (16 * (1 - e) / scale).toFixed(1) + "px";
        backdropWrap.style.opacity = e.toFixed(3);
        intro.style.opacity = clamp(1 - e * 1.8, 0, 1).toFixed(3);
        intro.style.transform = "translate3d(0," + (-40 * e).toFixed(1) + "px,0)";
        var hudVisible = clamp((e - 0.65) / 0.35, 0, 1);
        hud.style.opacity = hudVisible.toFixed(3);
        var hudOn = hudVisible > 0.5;
        if (hud.inert === hudOn) hud.inert = !hudOn;

        var i = scrolled < geo.expand ? 0 : Math.floor((scrolled - geo.expand) / geo.vh);
        activate(clamp(i, 0, total - 1), false);

        var visible = rect.bottom > 0 && rect.top < geo.vh;
        if (visible !== onScreen) {
            onScreen = visible;
            if (items[index].mode !== "full") startPreview();
        }

        // Full screen while the sticky stage covers the viewport: hide the header and the WhatsApp button.
        var nowImmersive = e > 0.98 && rect.bottom > geo.vh * 0.98;
        if (nowImmersive !== immersive) {
            immersive = nowImmersive;
            document.body.classList.toggle("vs-immersive", immersive);
        }
    }

    function requestUpdate() {
        if (!frame) frame = requestAnimationFrame(update);
    }

    // ---------- controls ----------
    fullButton.addEventListener("click", playFull);
    backButton.addEventListener("click", function () {
        exitFull();
        fullButton.focus({ preventScroll: true });
    });
    root.querySelector("[data-prev]").addEventListener("click", function () {
        if (index > 0) scrollToSlide(index - 1, true);
    });
    root.querySelector("[data-next]").addEventListener("click", function () {
        if (index < total - 1) scrollToSlide(index + 1, true);
        else scrollPastSection();
    });
    toggle.addEventListener("click", function () {
        autoplay = !autoplay;
        toggle.setAttribute("aria-pressed", String(!autoplay));
        toggle.textContent = autoplay ? "Pausar prévias" : "Reproduzir prévias";
        if (items[index].mode !== "full") startPreview();
    });

    document.addEventListener("visibilitychange", function () {
        if (index < 0 || items[index].mode === "full") return;
        if (document.hidden) items[index].video.pause();
        else startPreview();
    });

    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", function () { measure(); requestUpdate(); }, { passive: true });

    measure();
    activate(0, false);
    update();
})();
