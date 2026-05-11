import * as opentype from "./modules/opentype.module.js";
import Font from "./modules/Font.js";
import ControlBar from "./modules/Controls.js";

const mainEl = document.getElementById('content')
const landing = document.getElementById('landing')
const previewZone = document.getElementById('font-preview')
const fontfaceContainer = document.getElementById('previewFont')

const fontCache = {};

let fontUrl = './font/LostarkMobile_Test05-TypeA-1.otf';
let fontName = 'LostarkMobile_Test05-TypeA-1.otf';

const weightMap = {
    "Thin": 100,
    "UltraLight": 200,
    "Light": 300,
    "Regular": 400,
    "Medium": 500,
    "SemiBold": 600,
    "Bold": 700,
    "ExtraBold": 800,
    "Heavy": 900,
    "Black": 950
};

// Candidate list for body fonts
const candidateFonts = [
    {
        name: 'Rix신고딕',
        family: '"RixSinGo", sans-serif',
        weights: [
            { weight: "Thin", url: './font/RixSinGo_Pro Thin.woff2' },
            { weight: "UltraLight", url: './font/RixSinGo_Pro UltraLight.woff2' },
            { weight: "Light", url: './font/RixSinGo_Pro Light.woff2' },
            { weight: "Regular", url: './font/RixSinGo_Pro Regular.woff2' },
            { weight: "Medium", url: './font/RixSinGo_Pro Medium.woff2' },
            { weight: "SemiBold", url: './font/RixSinGo_Pro SemiBold.woff2' },
            { weight: "Bold", url: './font/RixSinGo_Pro Bold.woff2' },
            { weight: "ExtraBold", url: './font/RixSinGo_Pro ExtraBold.woff2' },
            { weight: "Heavy", url: './font/RixSinGo_Pro Heavy.woff2' },
            { weight: "Black", url: './font/RixSinGo_Pro Black.woff2' }
        ]
    },
    {
        name: 'Rix신헤드',
        family: '"RixSinHead", sans-serif',
        weights: [
            { weight: "Thin", url: './font/RixSinHead_Pro Thin.woff2' },
            { weight: "UltraLight", url: './font/RixSinHead_Pro UltraLight.woff2' },
            { weight: "Light", url: './font/RixSinHead_Pro Light.woff2' },
            { weight: "Regular", url: './font/RixSinHead_Pro Regular.woff2' },
            { weight: "Medium", url: './font/RixSinHead_Pro Medium.woff2' },
            { weight: "SemiBold", url: './font/RixSinHead_Pro SemiBold.woff2' },
            { weight: "Bold", url: './font/RixSinHead_Pro Bold.woff2' },
            { weight: "ExtraBold", url: './font/RixSinHead_Pro ExtraBold.woff2' },
            { weight: "Heavy", url: './font/RixSinHead_Pro Heavy.woff2' },
            { weight: "Black", url: './font/RixSinHead_Pro Black.woff2' }
        ]
    },
    {
        name: 'Rix모던고딕',
        family: '"RixMGo", sans-serif',
        weights: [
            { weight: "Thin", url: './font/RixMGo_Pro Thin.woff2' },
            { weight: "UltraLight", url: './font/RixMGo_Pro UltraLight.woff2' },
            { weight: "Light", url: './font/RixMGo_Pro Light.woff2' },
            { weight: "Regular", url: './font/RixMGo_Pro Regular.woff2' },
            { weight: "Medium", url: './font/RixMGo_Pro Medium.woff2' },
            { weight: "SemiBold", url: './font/RixMGo_Pro SemiBold.woff2' },
            { weight: "Bold", url: './font/RixMGo_Pro Bold.woff2' },
            { weight: "ExtraBold", url: './font/RixMGo_Pro ExtraBold.woff2' },
            { weight: "Heavy", url: './font/RixMGo_Pro Heavy.woff2' },
            { weight: "Black", url: './font/RixMGo_Pro Black.woff2' }
        ]
    },
    {
        name: 'Rix정고딕SE',
        family: '"RixJGoSE", sans-serif',
        weights: [
            { weight: "Light", url: './font/RixJGoSE_Pro Light.woff2' },
            { weight: "Regular", url: './font/RixJGoSE_Pro Regular.woff2' },
            { weight: "Medium", url: './font/RixJGoSE_Pro Medium.woff2' },
            { weight: "SemiBold", url: './font/RixJGoSE_Pro SemiBold.woff2' },
            { weight: "Bold", url: './font/RixJGoSE_Pro Bold.woff2' }
        ]
    }
];

const renderCandidates = () => {
    previewZone.innerHTML = '';

    // Inject dynamic @font-face styles if candidate fonts are local files
    let dynamicStyles = '';
    candidateFonts.forEach(candidate => {
        if (candidate.weights && candidate.weights.length > 0) {
            // Clean family name for font-face (e.g., remove quotes and sans-serif)
            const familyName = candidate.family.split(',')[0].replace(/"/g, '').trim();
            candidate.weights.forEach(w => {
                dynamicStyles += `
                    @font-face {
                        font-family: '${familyName}';
                        src: url('${w.url}');
                        font-weight: ${weightMap[w.weight] || w.weight};
                    }
                `;
            });
        }
    });

    if (dynamicStyles) {
        // Reuse or create a dedicated style tag for candidates
        let candidateStyle = document.getElementById('candidate-fonts-css');
        if (!candidateStyle) {
            candidateStyle = document.createElement('style');
            candidateStyle.id = 'candidate-fonts-css';
            document.head.appendChild(candidateStyle);
        }
        candidateStyle.innerText = dynamicStyles;
    }

    candidateFonts.forEach((candidate, index) => {
        const card = document.createElement('div');
        card.className = 'font-pair-card';
        card.innerHTML = `
            <div class="font-pair-header">
                <div>${candidate.name}</div>
            </div>
            <div class="text-group">
                <pre class="display-text" spellcheck="false">수상한 쳇바퀴의 움직임
풀숲 앞 경비병과 대화하기</pre>
            </div>
            <div class="text-group">
                <pre class="body-text" spellcheck="false" contenteditable="true" style='font-family: ${candidate.family}; font-size: 20px; font-weight: 400;'>은빛 안개가 골목 사이로 스며들던 새벽, 오래된 마을의 사람들은 저마다 느릿한 발걸음으로 하루를 준비했다. 
바람이 스치는 지붕 위에는 잊힌 이야기들이 내려앉아 있었고, 그 소리는 마치 누구도 끝까지 읽지 못한 오래된 편지의 마지막 문장처럼 애매하게 머물러 있었다.</pre>
            </div>
            <div class="body-controls flex">
                <div class="body-control-item">
                    <div class="rangeHeader flex">
                        <label>크기</label>
                        <input type="number" class="val-size input-val" value="20">
                    </div>
                    <input type="range" class="body-size sliderRange" min="10" max="100" value="20">
                </div>
                <div class="body-control-item">
                    <div class="rangeHeader flex">
                        <label>자간</label>
                        <input type="number" class="val-tracking input-val" step="0.001" value="0">
                    </div>
                    <input type="range" class="body-tracking sliderRange" min="-0.1" max="0.5" step="0.001" value="0">
                </div>
                <div class="body-control-item">
                    <div class="rangeHeader flex">
                        <label>웨이트</label>
                    </div>
                    <select class="body-weight">
                        ${candidate.weights ?
                candidate.weights.map(w => `<option value="${weightMap[w.weight] || w.weight}" ${w.weight === 'Regular' ? 'selected' : ''}>${w.weight}</option>`).join('') :
                `<option value="100">100</option>
                             <option value="300">300</option>
                             <option value="400" selected>400</option>
                             <option value="500">500</option>
                             <option value="600">600</option>
                             <option value="700">700</option>
                             <option value="900">900</option>`
            }
                    </select>
                </div>
                <div class="body-control-item">
                    <div class="rangeHeader flex">
                        <label>장평</label>
                        <input type="number" class="val-scale input-val" step="0.01" value="1">
                    </div>
                    <input type="range" class="body-scale sliderRange" min="0.5" max="1.5" step="0.01" value="1">
                </div>
            </div>
        `;

        const bodyText = card.querySelector('.body-text');

        const iSize = card.querySelector('.body-size');
        const vSize = card.querySelector('.val-size');
        const updateSize = (val) => {
            const rectBefore = vSize.getBoundingClientRect();
            const topBefore = rectBefore.top;

            bodyText.style.fontSize = val + 'px';
            iSize.value = val;
            vSize.value = val;

            const rectAfter = vSize.getBoundingClientRect();
            const topAfter = rectAfter.top;
            const diff = topAfter - topBefore;

            previewZone.scrollTop += diff;

            // vSize.scrollIntoView({ behavior: 'auto', block: 'center' });
        };
        iSize.addEventListener('input', e => updateSize(e.target.value));
        vSize.addEventListener('input', e => updateSize(e.target.value));

        const iTrack = card.querySelector('.body-tracking');
        const vTrack = card.querySelector('.val-tracking');
        const updateTrack = (val) => {
            const rectBefore = vTrack.getBoundingClientRect();
            const topBefore = rectBefore.top;

            bodyText.style.letterSpacing = val + 'em';
            iTrack.value = val;
            vTrack.value = val;

            const rectAfter = vTrack.getBoundingClientRect();
            const topAfter = rectAfter.top;
            const diff = topAfter - topBefore;

            previewZone.scrollTop += diff;

            // vTrack.scrollIntoView({ behavior: 'auto', block: 'center' });
        };
        iTrack.addEventListener('input', e => updateTrack(e.target.value));
        vTrack.addEventListener('input', e => updateTrack(e.target.value));

        card.querySelector('.body-weight').addEventListener('change', e => bodyText.style.fontWeight = e.target.value);

        const iScale = card.querySelector('.body-scale');
        const vScale = card.querySelector('.val-scale');
        const updateScale = (val) => {
            const rectBefore = vScale.getBoundingClientRect();
            const topBefore = rectBefore.top;

            bodyText.style.transform = `scaleX(${val})`;
            iScale.value = val;
            vScale.value = val;

            const rectAfter = vScale.getBoundingClientRect();
            const topAfter = rectAfter.top;
            const diff = topAfter - topBefore;

            previewZone.scrollTop += diff;

            // vScale.scrollIntoView({ behavior: 'auto', block: 'center' });
        };
        iScale.addEventListener('input', e => updateScale(e.target.value));
        vScale.addEventListener('input', e => updateScale(e.target.value));

        previewZone.appendChild(card);
    });
};

HTMLElement.prototype.setAttributes = function (attrs) {
    for (var key in attrs) {
        this.setAttribute(key, attrs[key]);
    }
}
HTMLElement.prototype.appendChildren = function (...nodes) {
    for (const node of nodes) {
        this.appendChild(node)
    }
}

const showErrorMessage = (err) => {
    console.log(err)
}

const setFontFace = (fontFace) => {
    const newStyle = document.createElement("style");
    newStyle.appendChild(document.createTextNode(fontFace));

    if (fontfaceContainer.children.length > 0) {
        fontfaceContainer.replaceChildren(newStyle)
        return
    }
    fontfaceContainer.appendChild(newStyle);
}

window.addEventListener('changeSampleFont', async (e) => {
    const selectedFont = e.detail;
    fontName = selectedFont;
    fontUrl = './font/' + selectedFont;
    try {
        let opentypeFont;
        if (fontCache[selectedFont] && fontCache[selectedFont].opentypeFont) {
            opentypeFont = fontCache[selectedFont].opentypeFont;
        } else {
            const response = await fetch(fontUrl);
            const arrayBuffer = await response.arrayBuffer();
            opentypeFont = opentype.parse(arrayBuffer);
            fontCache[selectedFont] = { opentypeFont };
        }
        
        window.currentFont = new Font(opentypeFont, fontUrl, fontName);
        setFontFace(window.currentFont.fontFace);

        document.querySelectorAll('.display-text').forEach(el => {
            el.style.fontFamily = "preview, sans-serif";
        });

        const controlBar = mainEl.querySelector('control-bar');
        if (controlBar) {
            controlBar.updateFont();
        }
    } catch (err) {
        showErrorMessage(err);
    }
});

const displayFontData = () => {
    if (!mainEl.querySelector('control-bar')) {
        const controlBar = new ControlBar()
        mainEl.appendChild(controlBar)

        renderCandidates();

        document.querySelectorAll('.display-text').forEach(el => {
            el.style.fontFamily = "preview, sans-serif";
            el.style.fontWeight = "unset";
        });

        if (landing) landing.style.display = "none";
        return
    }

    const controlBar = mainEl.querySelector('control-bar');
    controlBar.updateFont()
}

// Auto-load our target font
async function loadDefaultFont() {
    try {
        let opentypeFont;
        if (fontCache[fontName] && fontCache[fontName].opentypeFont) {
            opentypeFont = fontCache[fontName].opentypeFont;
        } else {
            const response = await fetch(fontUrl);
            const arrayBuffer = await response.arrayBuffer();
            opentypeFont = opentype.parse(arrayBuffer);
            fontCache[fontName] = { opentypeFont };
        }

        window.currentFont = new Font(opentypeFont, fontUrl, fontName);
        setFontFace(window.currentFont.fontFace);
        displayFontData();

        // Lazy load other fonts in the background to prevent blinking
        const otherFonts = [
            'LostarkMobile_Test05-TypeA-1.otf',
            'LostarkMobile_Test05-TypeA-2.otf',
            'LostarkMobile_Test05-TypeB-1.otf',
            'LostarkMobile_Test05-TypeB-2.otf'
        ];
        otherFonts.forEach(f => {
            if (f !== fontName && !fontCache[f]) {
                const link = document.createElement('link');
                link.rel = 'preload';
                link.as = 'font';
                link.crossOrigin = 'anonymous';
                link.href = './font/' + f;
                document.head.appendChild(link);

                fetch('./font/' + f)
                    .then(r => r.arrayBuffer())
                    .then(ab => {
                        fontCache[f] = { opentypeFont: opentype.parse(ab) };
                        const ff = new FontFace("preview_preload", `url('./font/${f}')`);
                        ff.load().then(loaded => document.fonts.add(loaded)).catch(e=>{});
                    }).catch(e => console.error(e));
            }
        });

    } catch (e) {
        showErrorMessage(e);
    }
}

const controlsDragHandler = () => {
    let isNarrow = document.body.offsetWidth < 768 ? true : false;
    let initialCoord;
    let movement = 0
    let target = 0
    let flexBasisPx = isNarrow ? 0 : 200;
    let flexBasisVp = isNarrow ? 0.4 : 0.1;
    let viewPort = isNarrow ? document.body.clientHeight : document.body.clientWidth
    let controlsMinSize = isNarrow ? 400 : 300;
    let controlsMaxSize = isNarrow ? 0.6 * viewPort : 0.5 * viewPort;
    let mouseDowned = false
    let controlsClicked = false

    mainEl.addEventListener('mousedown', (ev) => {
        isNarrow = document.body.offsetWidth < 768 ? true : false;

        initialCoord = isNarrow ? ev.clientY : ev.clientX

        mouseDowned = true;

        if (isNarrow) {
            target = document.elementsFromPoint(ev.clientX, ev.clientY).find(e => e.id === 'control-bar') ? document.elementsFromPoint(ev.clientX, ev.clientY).find(e => e.id === 'control-bar') : false;
            controlsClicked = target && target.offsetHeight - initialCoord < 7 ? true : false;
        } else {
            target = ev.target.id === 'control-bar' ? ev.target : false;
            controlsClicked = target && initialCoord - target.offsetLeft < 7 ? true : false;
        }
    })
    mainEl.addEventListener('mousemove', (ev) => {
        if (mouseDowned && controlsClicked) {
            movement = isNarrow ? ev.clientY - initialCoord : initialCoord - ev.clientX

            const [t, p] = isNarrow ? ['40vh', '60vh'] : ['10vw', '90vw']

            target.style.flexBasis = `calc(${flexBasisPx + movement}px + ${t})`
            previewZone.style.flexBasis = `calc(${- flexBasisPx - movement}px + ${p})`
        }
    })
    mainEl.addEventListener('mouseup', (ev) => {
        if (mouseDowned && controlsClicked) {

            mouseDowned = false
            if (flexBasisPx + movement + (viewPort * flexBasisVp) < controlsMinSize) {

                flexBasisPx = controlsMinSize - (viewPort * flexBasisVp)

            } else if (flexBasisPx + movement + (viewPort * flexBasisVp) > (controlsMaxSize)) {

                flexBasisPx = controlsMaxSize - (viewPort * flexBasisVp)

            } else {
                flexBasisPx = flexBasisPx + movement
            }
            movement = 0;

            const [t, p] = isNarrow ? ['40vh', '60vh'] : ['10vw', '90vw']

            target.style.flexBasis = `calc(${flexBasisPx + movement}px + ${t})`
            previewZone.style.flexBasis = `calc(${- flexBasisPx - movement}px + ${p})`
        }
    })
}

controlsDragHandler()
loadDefaultFont()
