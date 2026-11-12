// Video carousel: one video at a time.
// - Autoplay shows a silent 5 s preview of each video and then moves to the next one.
// - Clicking the video (or "Assistir completo") plays the full video with sound; when it
//   ends the carousel moves to the next video and the previews continue.
// - Previews only play while the carousel is on screen and the tab is visible.
// - Pause button for the automatic advance; with prefers-reduced-motion nothing autoplays.
// Without JS the markup is a plain list of videos with native controls.
(function () {
    "use strict";

    var root = document.querySelector("[data-video-carousel]");
    if (!root) return;

    var slides = Array.prototype.slice.call(root.querySelectorAll(".video-slide"));
    if (!slides.length) return;

    var controls = root.querySelector(".video-carousel__controls");
    var dotsWrap = root.querySelector(".video-carousel__dots");
    var toggle = root.querySelector("[data-toggle]");
    var status = root.querySelector("[data-status]");
    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    var index = 0;
    var autoplay = !reduceMotion;
    var inView = false;
    var frame = 0;

    var items = slides.map(function (slide, i) {
        var video = slide.querySelector("video");
        var source = video.querySelector("source");
        var item = {
            slide: slide,
            video: video,
            full: source ? source.getAttribute("src") : video.getAttribute("src"),
            preview: slide.getAttribute("data-preview"),
            playButton: slide.querySelector(".video-slide__play"),
            bar: slide.querySelector(".video-slide__progress span"),
            caption: (slide.querySelector("figcaption") || slide).textContent.trim(),
            mode: "none" // "none" | "preview" | "full"
        };

        video.removeAttribute("controls");
        video.muted = true;
        video.playsInline = true;
        video.preload = "none";
        item.playButton.hidden = false;

        video.addEventListener("click", function () {
            if (item.mode !== "full") playFull(i);
        });
        item.playButton.addEventListener("click", function () { playFull(i); });
        video.addEventListener("ended", function () {
            if (i !== index) return;
            if (item.mode === "full" || autoplay) go(index + 1, false);
        });
        video.addEventListener("play", startProgress);

        var dot = document.createElement("button");
        dot.type = "button";
        dot.className = "video-carousel__dot";
        dot.setAttribute("aria-label", "Vídeo " + (i + 1) + ": " + item.caption);
        dot.addEventListener("click", function () { go(i, true); });
        dotsWrap.appendChild(dot);
        item.dot = dot;
        return item;
    });

    function setSource(item, mode) {
        if (item.mode === mode) return;
        item.mode = mode;
        if (mode === "none") {
            item.video.removeAttribute("src");
        } else {
            item.video.src = mode === "full" ? item.full : item.preview;
        }
        item.video.load();
    }

    function safePlay(video) {
        var promise = video.play();
        if (promise && promise.catch) promise.catch(function () { /* autoplay blocked: the poster stays */ });
    }

    function startPreview() {
        var item = items[index];
        item.video.muted = true;
        item.video.controls = false;
        item.playButton.hidden = false;
        item.slide.classList.remove("is-full");
        setSource(item, "preview");
        if (autoplay && inView && !document.hidden) {
            safePlay(item.video);
            // Warm up the next preview so the switch is instant.
            var next = items[(index + 1) % items.length];
            if (next.mode === "none") {
                next.video.preload = "auto";
                setSource(next, "preview");
            }
        } else {
            item.video.pause();
        }
    }

    function playFull(i) {
        if (i !== index) go(i, true);
        var item = items[index];
        cancelAnimationFrame(frame);
        item.bar.style.transform = "scaleX(0)";
        setSource(item, "full");
        item.slide.classList.add("is-full");
        item.playButton.hidden = true;
        item.video.controls = true;
        item.video.muted = false;
        item.video.currentTime = 0;
        safePlay(item.video);
    }

    function go(target, manual) {
        var current = items[index];
        current.video.pause();
        current.bar.style.transform = "scaleX(0)";
        if (current.mode === "full") setSource(current, "none"); // stop downloading the full video

        index = (target + items.length) % items.length;
        items.forEach(function (item, i) {
            var active = i === index;
            item.slide.classList.toggle("is-active", active);
            item.slide.setAttribute("aria-hidden", String(!active));
            if ("inert" in item.slide) item.slide.inert = !active;
            if (active) item.dot.setAttribute("aria-current", "true");
            else item.dot.removeAttribute("aria-current");
        });
        if (manual) status.textContent = "Vídeo " + (index + 1) + " de " + items.length + ": " + items[index].caption;
        items[index].video.currentTime = 0;
        startPreview();
    }

    function startProgress() {
        cancelAnimationFrame(frame);
        var item = items[index];
        var loop = function () {
            if (item.mode !== "preview" || item.video.paused) return;
            var duration = item.video.duration || 5;
            item.bar.style.transform = "scaleX(" + Math.min(item.video.currentTime / duration, 1) + ")";
            frame = requestAnimationFrame(loop);
        };
        frame = requestAnimationFrame(loop);
    }

    function setAutoplay(on) {
        autoplay = on;
        toggle.setAttribute("aria-pressed", String(!on));
        toggle.textContent = on ? "Pausar prévias" : "Reproduzir prévias";
        if (items[index].mode !== "full") startPreview();
    }

    root.querySelector("[data-prev]").addEventListener("click", function () { go(index - 1, true); });
    root.querySelector("[data-next]").addEventListener("click", function () { go(index + 1, true); });
    toggle.addEventListener("click", function () { setAutoplay(!autoplay); });

    // Swipe between videos on touch screens (only while showing previews).
    var touchX = null;
    root.addEventListener("touchstart", function (event) {
        touchX = items[index].mode === "full" ? null : event.touches[0].clientX;
    }, { passive: true });
    root.addEventListener("touchend", function (event) {
        if (touchX === null) return;
        var dx = event.changedTouches[0].clientX - touchX;
        if (Math.abs(dx) > 50) go(index + (dx < 0 ? 1 : -1), true);
        touchX = null;
    }, { passive: true });

    document.addEventListener("visibilitychange", function () {
        var item = items[index];
        if (item.mode === "full") return; // the user is watching: leave it alone
        if (document.hidden) item.video.pause();
        else startPreview();
    });

    // Posters are only set when the visitor gets close, so they never compete with the top of the page.
    var postersSet = false;
    function setPosters() {
        if (postersSet) return;
        postersSet = true;
        items.forEach(function (item) {
            var poster = item.video.getAttribute("data-poster");
            if (poster) item.video.poster = poster;
        });
    }

    if ("IntersectionObserver" in window) {
        var nearObserver = new IntersectionObserver(function (entries) {
            if (!entries[0].isIntersecting) return;
            setPosters();
            nearObserver.disconnect();
        }, { rootMargin: "800px 0px" });
        nearObserver.observe(root);

        new IntersectionObserver(function (entries) {
            inView = entries[0].isIntersecting;
            if (items[index].mode === "full") return;
            if (inView) startPreview();
            else items[index].video.pause();
        }, { threshold: 0.35 }).observe(root);
    } else {
        inView = true;
        setPosters();
    }

    root.classList.add("is-enhanced");
    controls.hidden = false;
    setAutoplay(autoplay);
    go(0, false);
})();
