const world = document.getElementById("world");
const progress = document.getElementById("progress");

let position = 0;

const step = 258;

function updateCamera() {
    const maxScroll =
        world.scrollWidth - world.parentElement.clientWidth + 100;

    position = Math.max(0, Math.min(position, maxScroll));

    world.style.transform = `translateX(-${position}px)`;

    const percentage = Math.min(
        100,
        Math.max(10, (position / maxScroll) * 100),
    );

    progress.style.width = percentage + "%";
}

function moveRight() {
    position += step;

    updateCamera();
}

function moveLeft() {
    position -= step;

    updateCamera();
}

document.querySelector(".viewport").addEventListener(
    "wheel",
    function (event) {
        if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
            position += event.deltaY * 1.3;
        } else {
            position += event.deltaX;
        }

        updateCamera();
    },
    { passive: true },
);

let dragging = false;
let startX = 0;
let startPosition = 0;

const viewport = document.querySelector(".viewport");

viewport.addEventListener("pointerdown", (event) => {
    dragging = true;
    startX = event.clientX;
    startPosition = position;

    viewport.setPointerCapture(event.pointerId);

    document.body.style.cursor = "grabbing";
});

viewport.addEventListener("pointermove", (event) => {
    if (!dragging) return;

    const distance = event.clientX - startX;

    position = startPosition - distance;

    updateCamera();
});

viewport.addEventListener("pointerup", () => {
    dragging = false;

    document.body.style.cursor = "default";
});

document.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") {
        moveRight();
    }

    if (event.key === "ArrowLeft") {
        moveLeft();
    }
});

let coins = 2450;
let gems = 380;

const coinsElement = document.getElementById("coins");

const gemsElement = document.getElementById("gems");

const toast = document.getElementById("toast");

function purchase(item, price) {
    if (price > 0) {
        if (coins < price) {
            showToast("Not enough coins for " + item);

            return;
        }

        coins -= price;

        coinsElement.textContent = coins.toLocaleString();
    }

    showToast(item + " purchased!");
}

document.querySelectorAll("[data-item][data-price]").forEach((button) => {
    button.addEventListener("click", () => {
        purchase(button.dataset.item, Number(button.dataset.price));
    });
});

document.getElementById("move-left")?.addEventListener("click", moveLeft);
document.getElementById("move-right")?.addEventListener("click", moveRight);

function showToast(message) {
    toast.textContent = message;

    toast.classList.add("show");

    clearTimeout(window.toastTimer);

    window.toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 2200);
}

let autoScroll = true;

setInterval(() => {
    if (!autoScroll || dragging) return;

    const max = world.scrollWidth - viewport.clientWidth + 100;

    if (position >= max) {
        position = 0;
    } else {
        position += 0.45;
    }

    updateCamera();
}, 30);

viewport.addEventListener("mouseenter", () => {
    autoScroll = false;
});

viewport.addEventListener("mouseleave", () => {
    autoScroll = true;
});

window.addEventListener("resize", updateCamera);

updateCamera();
