// 2000s Cursor Trail Effect
document.addEventListener("DOMContentLoaded", () => {
    // Also change the cursor to a custom image
    document.body.style.cursor = "url('/images/cursor.png'), auto";
    
    // Add a trailing effect
    const numTrails = 10;
    const trails = [];
    
    for (let i = 0; i < numTrails; i++) {
        const div = document.createElement("div");
        div.style.position = "fixed";
        div.style.width = "10px";
        div.style.height = "10px";
        div.style.backgroundColor = i % 2 === 0 ? "magenta" : "cyan";
        div.style.borderRadius = "50%";
        div.style.pointerEvents = "none";
        div.style.zIndex = "9999";
        div.style.transition = "all 0.1s linear";
        div.style.opacity = "0.8";
        document.body.appendChild(div);
        trails.push(div);
    }
    
    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    
    document.addEventListener("mousemove", (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    });
    
    // Animation loop for trail
    function animateTrails() {
        let x = mouseX;
        let y = mouseY;
        
        for (let i = 0; i < trails.length; i++) {
            const trail = trails[i];
            const nextX = parseFloat(trail.style.left || x);
            const nextY = parseFloat(trail.style.top || y);
            
            trail.style.left = x + "px";
            trail.style.top = y + "px";
            trail.style.transform = `scale(${(trails.length - i) / trails.length})`;
            
            x += (nextX - x) * 0.5;
            y += (nextY - y) * 0.5;
        }
        
        requestAnimationFrame(animateTrails);
    }
    
    animateTrails();
});
