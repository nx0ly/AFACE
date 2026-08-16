// Global UI: Global Music & Top-Right Points
document.addEventListener("DOMContentLoaded", async () => {
    const extApi = globalThis.browser ?? globalThis.chrome;

    // 1. Points UI (Top Right)
    const pointsContainer = document.createElement("div");
    pointsContainer.style.position = "fixed";
    pointsContainer.style.top = "20px";
    pointsContainer.style.right = "20px";
    pointsContainer.style.display = "flex";
    pointsContainer.style.alignItems = "center";
    pointsContainer.style.gap = "8px";
    pointsContainer.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
    pointsContainer.style.border = "3px outset #ffcc00";
    pointsContainer.style.borderRadius = "8px";
    pointsContainer.style.padding = "5px 15px";
    pointsContainer.style.zIndex = "999999";
    pointsContainer.style.boxShadow = "2px 2px 0px #000";

    const pointsText = document.createElement("span");
    pointsText.style.color = "lime";
    pointsText.style.fontFamily = "'Courier New', Courier, monospace";
    pointsText.style.fontSize = "24px";
    pointsText.style.fontWeight = "bold";
    pointsText.innerText = "0";

    const beanImgUrl = extApi ? extApi.runtime.getURL("images/bean.png") : "/images/bean.png";
    const beanImg = document.createElement("img");
    beanImg.src = beanImgUrl;
    beanImg.style.width = "30px";
    beanImg.style.height = "30px";
    beanImg.style.imageRendering = "pixelated";
    beanImg.alt = "Beans";

    pointsContainer.appendChild(pointsText);
    pointsContainer.appendChild(beanImg);
    document.body.appendChild(pointsContainer);

    const storage = globalThis.browser?.storage?.local ?? globalThis.chrome?.storage?.local;
    if (storage) {
        const updateBeans = async () => {
            const saved = await storage.get("page-pause:tokens");
            const val = saved["page-pause:tokens"];
            pointsText.innerText = typeof val === "number" ? Math.floor(val).toString() : "0";
        };
        await updateBeans();
        
        extApi?.storage?.onChanged?.addListener((changes, area) => {
            if (area === "local" && changes["page-pause:tokens"]) {
                updateBeans();
            }
        });
    }

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
