import * as opentype from "./modules/opentype.module.js";
import Font from "./modules/Font.js";
import ControlBar from "./modules/Controls.js";

const mainEl = document.getElementById('content')
const landing = document.getElementById('landing')
const previewZone = document.getElementById('font-preview')
const userText = document.getElementById('userText')
const fontfaceContainer = document.getElementById('previewFont')

const fontUrl = './font/LostarkMobile_Test_260326-VF.ttf';
const fontName = 'LostarkMobile_Test_260326-VF.ttf';

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

const displayFontData = () => {
    if (!mainEl.querySelector('control-bar')) {
        const controlBar = new ControlBar()
        mainEl.appendChild(controlBar)

        userText.style.fontFamily = "preview, sans-serif";
        userText.style.fontWeight = "unset";

        if (landing) landing.style.display = "none";
        return
    }

    const controlBar = mainEl.querySelector('control-bar');
    controlBar.updateFont()
}

// Auto-load our target font
async function loadDefaultFont() {
    try {
        const response = await fetch(fontUrl);
        const arrayBuffer = await response.arrayBuffer();

        // Emulate drag-and-drop file to match Font.js signature
        const blob = new Blob([arrayBuffer]);
        const opentypeFont = opentype.parse(arrayBuffer);

        // Pass fake URL
        window.currentFont = new Font(opentypeFont, fontUrl, fontName);
        setFontFace(window.currentFont.fontFace);
        displayFontData();

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
