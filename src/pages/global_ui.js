// Global UI: Global Music Only
document.addEventListener("DOMContentLoaded", async () => {
    const extApi = globalThis.browser ?? globalThis.chrome;

    // Global Music (Resumes across tabs)
    const audioUrl = extApi ? extApi.runtime.getURL("music.mp3") : "/music.mp3";
    const audio = new Audio(audioUrl);
    audio.loop = true;
    audio.volume = 1.0;

    // Visible music toggle button
    const musicBtn = document.createElement("button");
    musicBtn.innerText = "🔇";
    musicBtn.style.position = "fixed";
    musicBtn.style.bottom = "20px";
    musicBtn.style.right = "20px";
    musicBtn.style.background = "rgba(0,0,0,0.8)";
    musicBtn.style.border = "3px outset silver";
    musicBtn.style.borderRadius = "50%";
    musicBtn.style.cursor = "pointer";
    musicBtn.style.fontSize = "30px";
    musicBtn.style.padding = "10px";
    musicBtn.style.zIndex = "999999";
    musicBtn.title = "Click for music";
    document.body.appendChild(musicBtn);

    let musicStarted = false;

    function startMusic() {
        if (musicStarted) return;
        const savedTime = sessionStorage.getItem("globalMusicTime");
        if (savedTime) {
            audio.currentTime = parseFloat(savedTime);
        }
        audio.play().then(() => {
            musicStarted = true;
            musicBtn.innerText = "🔊";
        }).catch((err) => {
            console.error("Manual play error:", err);
            alert("Error playing music: " + err.message);
        });
    }

    musicBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!musicStarted || audio.paused) {
            audio.play().then(() => {
                musicStarted = true;
                musicBtn.innerText = "🔊";
            }).catch((err) => {
                console.error("Toggle play error:", err);
                alert("Error toggling music: " + err.message);
            });
        } else {
            audio.pause();
            musicBtn.innerText = "🔇";
        }
    });

    audio.addEventListener('error', (e) => {
        console.error("Audio element error:", audio.error);
        alert("Audio element error: " + (audio.error ? audio.error.message : "Unknown"));
    });

    // Try autoplay, if blocked catch ANY interaction on the page
    audio.play().then(() => {
        musicStarted = true;
        musicBtn.innerText = "🔊";
    }).catch((err) => {
        console.warn("Autoplay blocked or failed:", err);
        // Use capture phase on window to catch clicks on canvas, buttons, etc.
        const playOnInteraction = () => {
            audio.play().then(() => {
                musicStarted = true;
                musicBtn.innerText = "🔊";
            }).catch((err) => console.error("Interaction play error:", err));
            window.removeEventListener("pointerdown", playOnInteraction, true);
            window.removeEventListener("keydown", playOnInteraction, true);
        };
        window.addEventListener("pointerdown", playOnInteraction, true);
        window.addEventListener("keydown", playOnInteraction, true);
    });

    // Save position so it resumes when navigating between extension pages
    setInterval(() => {
        if (!audio.paused) {
            sessionStorage.setItem("globalMusicTime", String(audio.currentTime));
        }
    }, 200);
});
