
const CLICKS_PER_ITEM = 10000;
const IMG_FIRST = 'assets/images/IMG_1395.PNG';
const IMG_SECOND = 'assets/images/IMG_1397.JPG';
const IMG_PRIZE = 'assets/images/prize.png';

const items = [
    { name: 'первый образ (форма)', path: null },
    { name: 'розовый бант в волосах', path: 'M 0.14 0.08 L 0.24 0.08 L 0.24 0.16 L 0.14 0.16 Z' },
    { name: 'белый бантик на груди', path: 'M 0.44 0.28 L 0.56 0.28 L 0.56 0.34 L 0.44 0.34 Z' },
    { name: 'левый бретель', path: 'M 0.22 0.30 L 0.32 0.30 L 0.32 0.48 L 0.22 0.48 Z' },
    { name: 'правый бретель', path: 'M 0.68 0.30 L 0.78 0.30 L 0.78 0.48 L 0.68 0.48 Z' },
    { name: 'топ (майка)', path: 'M 0.30 0.34 L 0.70 0.34 L 0.70 0.58 L 0.30 0.58 Z' },
    { name: 'трусики', path: 'M 0.34 0.56 L 0.66 0.56 L 0.66 0.82 L 0.34 0.82 Z' }
];

let totalClicks = 0;
let removedCount = 0;
let clickTimestamps = [];
let cheatWarningTimeout = null;
let isIdle = false;
let idleTimeoutTriggerId = null;
let tickTimerId = null;
const MAX_CLICKS_PER_SECOND = 15;
const clicksEl = document.getElementById('clicks');
const progressTextEl = document.getElementById('progressText');
const hintEl = document.getElementById('hint');
const characterWrap = document.getElementById('characterWrap');
const characterEl = document.getElementById('character');
const clipPathEl = document.getElementById('clipPath');
const cheatWarningEl = document.getElementById('cheatWarning');
const img = document.getElementById('characterImg');
const girlsWords = document.getElementById('girls-words');

girlsWords.style.top = `${characterWrap.offsetTop}px`;
girlsWords.style.left = `${characterWrap.offsetLeft + characterWrap.offsetWidth / 2}px` 

function formatNum(n) {
    return n.toLocaleString('ru-RU');
}

function buildClipPath(removed) {
    let d = 'M 0 0 L 1 0 L 1 1 L 0 1 Z';
    if (removed <= 0) return d;
    for (let i = 1; i < removed; i++) {
        if (items[i].path) d += ' ' + items[i].path;
    }
    return d;
}

function updateImage() {

    switch (removedCount) {
        case 2: {
            img.src = IMG_SECOND;
            break;
        }
        default: {
            img.src = IMG_FIRST;
            break;
        }
    }
    img.src = removedCount >= 1 ? IMG_SECOND : IMG_FIRST;
}

function updateUI() {
    clicksEl.textContent = formatNum(totalClicks);
    if (removedCount >= items.length) {
        progressTextEl.textContent = 'Все элементы сняты!';
        hintEl.textContent = 'Всё снято!';
        img.src = IMG_PRIZE;
        if(tickTimerId) {
            clearInterval(tickTimerId);
        }
        if(idleTimeoutTriggerId) {
            clearTimeout(idleTimeoutTriggerId);
        }
        
        
        girlsWords.innerHTML = `
        <span>Ох, мне как-то неловко🤭</span>
        <span>Ты добился своего, хи-хи😏</span>
        `
        girlsWords.hidden = false;
        return;
    }

    const nextThreshold = (removedCount + 1) * CLICKS_PER_ITEM;
    const progress = totalClicks - removedCount * CLICKS_PER_ITEM;
    progressTextEl.textContent = `${formatNum(progress)} / ${formatNum(CLICKS_PER_ITEM)} до следующего предмета`;
    hintEl.textContent = `Следующий: ${items[removedCount].name}`;
}

function applyClip() {
    clipPathEl.setAttribute('d', buildClipPath(removedCount));
    characterEl.style.clipPath = 'url(#characterClip)';
    updateImage();
}

function showCheatWarning() {
    cheatWarningEl.classList.add('show');
    clearTimeout(cheatWarningTimeout);
    cheatWarningTimeout = setTimeout(() => {
        cheatWarningEl.classList.remove('show');
    }, 2000);
}

function isAutoClickerDetected() {
    const now = Date.now();
    clickTimestamps.push(now);
    clickTimestamps = clickTimestamps.filter(timestamp => now - timestamp <= 1000);
    return clickTimestamps.length > MAX_CLICKS_PER_SECOND;
}

// Звёзды на фоне
function initStars() {
    const container = document.getElementById('stars');
    const count = 120;
    for (let i = 0; i < count; i++) {
        const star = document.createElement('div');
        star.className = 'star';
        const size = Math.random() * 2 + 0.5;
        star.style.width = size + 'px';
        star.style.height = size + 'px';
        star.style.left = Math.random() * 100 + '%';
        star.style.top = Math.random() * 100 + '%';
        star.style.animationDelay = Math.random() * 2 + 's';
        container.appendChild(star);
    }
};

tickTimerId = setInterval(() => {
    if (isIdle && totalClicks > 0) {
        totalClicks--;
        girlsWords.hidden = false;
        updateUI();
    }
}, 1000);

characterWrap.addEventListener('click', function () {
    /* if (isAutoClickerDetected()) {
        showCheatWarning();
        return;
    } */

    if (isIdle) {
        isIdle = false;
        girlsWords.hidden = true;
        if (idleTimeoutTriggerId) {
            clearTimeout(idleTimeoutTriggerId);
            idleTimeoutTriggerId = null;
        }

    }

    if (!idleTimeoutTriggerId) {
        idleTimeoutTriggerId = setTimeout(() => {
            isIdle = true;
        }, 5000);
    }


    totalClicks++;



    while (removedCount < items.length && totalClicks >= (removedCount + 1) * CLICKS_PER_ITEM) {
        removedCount++;
        applyClip();
    }



    updateUI();
});

initStars();
updateUI();
applyClip();
