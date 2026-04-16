const mainEl = document.getElementById('content')

export default class Settings {
    constructor(opentypeFont) {
        this.font = opentypeFont
        this.updateData(opentypeFont)
        this.currentState = {};

    }
    updateFontCSS() {
        for (const [key, value] of Object.entries(this.currentState.basics)) {
            document.documentElement.style.setProperty(`--display-${key}`, `${value[0]}${value[1]}`);
        }
    }
    updateVariationCSS() {
        const varCssStringRaw = JSON.stringify(this.currentState.variations)
        const varCssString = varCssStringRaw.replaceAll(':', ' ').slice(1, -1)
        document.documentElement.style.setProperty('--display-font-variation-settings', varCssString);
    }
    updateFeatureCSS() {
        const feaCssStringRaw = JSON.stringify(this.currentState.features)
        const feaCssString = feaCssStringRaw.replaceAll('false', 0).replaceAll('true', '').replaceAll(':', ' ').slice(1, -1)
        document.documentElement.style.setProperty('--display-font-feature-settings', feaCssString);
    }
    updateColor() {
        for (const [key, value] of Object.entries(this.currentState.colors)) {
            mainEl.style[key] = value
        }
    }
    updateInstance() {
        const coordinates = this.currentState.instance[0].coordinates;
        this.currentState.variations = { ...coordinates };
        for (const [axis, value] of Object.entries(coordinates)) {
            const inputs = this.parent.querySelectorAll(`.${axis}input`)
            for (const input of inputs) {
                input.value = Math.round(value * 100) / 100;
            }
            // Explicitly sync the custom elements' internal states
            this.parent.querySelectorAll('variableinput-range').forEach(el => {
                if (el.prop === axis) {
                    el.currentState[el.prop] = value;
                }
            });
            this.updateVariationCSS()
        }
    }
    updateData(opentypeFont) {
        this.font = opentypeFont;
        this.fileName = opentypeFont.fileName;
        this.variationAxes = this.font.variationAxes;
        this.gsubFeatures = this.font.gsubFeatures;
        this.gposFeatures = this.font.gposFeatures;
        this.featureLists = [this.font.gsubFeatures].concat([this.font.gposFeatures]).flatMap(e => e);

        this.recommendationLists = [
            { tag: 'rcA2', uiName: 'Type A-2 | 강도 01', name: 'Type A-2 | 강도 01' },
            { tag: 'rcB1', uiName: 'Type B-1 | 강도 03', name: 'Type B-1 | 강도 03' },
            { tag: 'rcB3', uiName: 'Type B-3 | 강도 05', name: 'Type B-3 | 강도 05' }
        ];

        // Inject Type A/B explicit feature blocks above ss01
        const ss01Idx = this.featureLists.findIndex(f => f && f.tag === 'ss01');
        if (ss01Idx !== -1) {
            this.featureLists.splice(ss01Idx, 0,
                { tag: 'tpA0', uiName: 'Type A-기본형', name: 'Type A-기본형' },
                { tag: 'tpA1', uiName: 'Type A-1', name: 'Type A-1' },
                { tag: 'tpA2', uiName: 'Type A-2', name: 'Type A-2' },
                { tag: 'tpA3', uiName: 'Type A-3', name: 'Type A-3' },
                { tag: 'tpB0', uiName: 'Type B-기본형', name: 'Type B-기본형' },
                { tag: 'tpB1', uiName: 'Type B-1', name: 'Type B-1' },
                { tag: 'tpB2', uiName: 'Type B-2', name: 'Type B-2' },
                { tag: 'tpB3', uiName: 'Type B-3', name: 'Type B-3' }
            );
        }

        this.settings = {
            // textKinds,
            playSpeeds: [0.5, 1, 1.5, 2],
            featureLists: this.featureLists,
            recommendationLists: this.recommendationLists,
            toolBoxes: ['로스트아크 모바일 전용서체 개발 제안', 'Basic Controls', 'Variable Settings', 'Opentype Features', '추천 시안', 'Colors'],
            toolBoxCheckers: [true, true, false, this.featureLists[0] ? true : false, true, true],
            basicControls: {
                "Size": { min: 10, max: 300, default: window.matchMedia('(max-width: 768px)').matches ? 30 : 100, step: 1, prop: "fontSize", unit: "px" },
                "Line Height": { min: 0, max: 2, default: 1.2, step: 0.01, prop: "lineHeight" },
                "Letter Spacing": { min: -1, max: 1, default: 0, step: 0.01, prop: "letterSpacing", unit: "rem" }
            },
            capTags: ["smcp", "c2sc", "pcap", "c2pc"],
            figureTags: ["pnum", "tnum", "lnum", "onum"],
            figureHeights: [
                { value: "default", label: "default" },
                { value: "lnum", label: "lining" },
                { value: "onum", label: "oldstyle" },
            ],
            figureHeight: "default",
            figureWidths: [
                { value: "default", label: "default" },
                { value: "pnum", label: "proportional" },
                { value: "tnum", label: "tabular" },
            ],
            figureWidth: "default",
            numberTags: ["sups", "subs", "numr", "dnom", "frac", "zero"],
            stylisticSetTags: Array(20)
                .fill(0)
                .map((_, i) => `ss${(i + 1).toString().padStart(2, "0")}`),
            characterVariantsTags: Array(99)
                .fill(0)
                .map((_, i) => `cv${(i + 1).toString().padStart(2, "0")}`),
            loclTags: ["locl"],
            loclSelectKeys: {
                class: "class",
                label: "name",
                image: "image",
            },
            colorData: {
                "Typeface": { prop: "color", defaultValue: "000000" },
                "Background": { prop: "backgroundColor", defaultValue: "FFFFFF" }
            },
        }
    }
}
