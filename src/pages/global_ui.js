// Global UI: Coffee Beans Corner & Global Music
document.addEventListener("DOMContentLoaded", async () => {
    // 1. Coffee Beans Corner UI
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.bottom = "20px";
    container.style.right = "20px";
    container.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
    container.style.border = "3px outset #ffcc00";
    container.style.padding = "5px 15px";
    container.style.borderRadius = "5px";
    container.style.zIndex = "999999";
    container.style.display = "flex";
    container.style.alignItems = "center";
    container.style.gap = "10px";
    container.style.fontFamily = "'Courier New', Courier, monospace";
    container.style.color = "white";
    container.style.fontSize = "24px";
    container.style.fontWeight = "bold";
    container.style.boxShadow = "4px 4px 0px #000";

    const img = document.createElement("img");
    img.src = "/images/bean.png"; // User will add this image later
    img.style.width = "40px";
    img.style.height = "40px";
    img.style.imageRendering = "pixelated";
    img.alt = "Beans";
    container.appendChild(img);

    const text = document.createElement("span");
    text.innerText = "0";
    container.appendChild(text);

    document.body.appendChild(container);

    // Update token count
    const storage = globalThis.browser?.storage?.local ?? globalThis.chrome?.storage?.local;
    if (storage) {
        const updateBeans = async () => {
            const saved = await storage.get("page-pause:tokens");
            const val = saved["page-pause:tokens"];
            text.innerText = typeof val === "number" ? Math.floor(val) : 0;
        };
        await updateBeans();
        
        // Listen for changes
        const api = globalThis.browser ?? globalThis.chrome;
        api?.storage?.onChanged?.addListener((changes, area) => {
            if (area === "local" && changes["page-pause:tokens"]) {
                updateBeans();
            }
        });
    }

    // 2. Global Music (Resumes across tabs)
    const audio = new Audio("/music.mp3"); // User will add music.mp3 later
    audio.loop = true;
    audio.volume = 0.5;

    const savedTime = sessionStorage.getItem("globalMusicTime");
    if (savedTime) {
        audio.currentTime = parseFloat(savedTime);
    }

    // Try to play (might be blocked until first interaction)
    audio.play().catch(() => {
        // If blocked, wait for any click
        const playOnInteraction = () => {
            audio.play();
            document.removeEventListener("click", playOnInteraction);
            document.removeEventListener("keydown", playOnInteraction);
        };
        document.addEventListener("click", playOnInteraction);
        document.addEventListener("keydown", playOnInteraction);
    });

    setInterval(() => {
        if (!audio.paused) {
            sessionStorage.setItem("globalMusicTime", audio.currentTime);
        }
    }, 100);
});
