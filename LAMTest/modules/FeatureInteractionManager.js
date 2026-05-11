export default class FeatureInteractionManager {
    /**
     * Initialize UI layout: hide specific features and insert dividers.
     * @param {HTMLElement} container - The toolbox container
     */
    static initializeUI(container) {
        // Hide aalt, salt, and raw ss01-ss04
        ['aaltBox', 'saltBox', 'ss01Box', 'ss02Box', 'ss03Box', 'ss04Box'].forEach(id => {
            const box = container.querySelector(`#${id}`);
            if (box) {
                const block = box.closest('feature-block');
                if (block) block.style.display = 'none';
            }
        });

        // Insert horizontal dividers between specific stylistic set groups
        const insertDividerAfter = (id) => {
            const box = container.querySelector(`#${id}`);
            if (box) {
                const block = box.closest('feature-block');
                if (block && block.nextSibling) {
                    const divider = document.createElement('hr');
                    divider.style.border = 'none';
                    divider.style.borderTop = '1px solid rgba(128, 128, 128, 0.2)';
                    divider.style.margin = '5px 0';
                    divider.style.width = '100%';
                    block.parentNode.insertBefore(divider, block.nextSibling);
                }
            }
        };

        insertDividerAfter('ss08Box');
        insertDividerAfter('ss13Box');
        insertDividerAfter('ss14Box');
    }

    /**
     * Enforce interaction rules on the features state object.
     * @param {Object} features - The current global features state
     * @param {string} changedProp - The feature tag that was just toggled
     * @param {boolean} newValue - The new boolean value of the toggled feature
     */
    static applyRules(features, changedProp, newValue) {
        const typeGroup = ['tpA0','tpA1','tpA2','tpA3','tpB0','tpB1','tpB2','tpB3', 'rcA2', 'rcB1', 'rcB3'];
        
        if (typeGroup.includes(changedProp)) {
            // Entorce radio behavior for this group: if one is checked, others are unchecked.
            if (newValue) {
                typeGroup.forEach(prop => {
                    if (prop !== changedProp) features[prop] = false;
                });
            }
            
            // Map the active typeGroup item to actual ss01-ss04 features
            const activeType = typeGroup.find(p => features[p]);
            features['ss01'] = ['tpA1', 'tpB1', 'rcB1'].includes(activeType);
            features['ss02'] = ['tpA2', 'tpB2', 'rcA2'].includes(activeType);
            features['ss03'] = ['tpA3', 'tpB3', 'rcB3'].includes(activeType);
            features['ss04'] = ['tpB0', 'tpB1', 'tpB2', 'tpB3', 'rcB1', 'rcB3'].includes(activeType);

            // If a stylistic variant (1, 2, 3) is active, ensure general groups (ss05-08) are off
            if ((features['ss01'] || features['ss02'] || features['ss03']) && newValue) {
                 ['ss05','ss06','ss07','ss08'].forEach(p => { features[p] = false; });
            }
        }

        // Group 1: ss05-ss08 are mutually exclusive
        const group1Old = ['ss05', 'ss06', 'ss07', 'ss08'];
        if (group1Old.includes(changedProp) && newValue) {
            group1Old.forEach(prop => {
                if (prop !== changedProp && features[prop] !== undefined) features[prop] = false;
            });
            // If selecting ss05-08 manually, visually strip the ss01-ss03 mapping leaving only tpA0 or tpB0
            if (features['ss04']) {
                 typeGroup.forEach(p => { if(features[p] !== undefined) features[p] = false; });
                 features['tpB0'] = true;
                 features['ss01'] = features['ss02'] = features['ss03'] = false;
            } else {
                 typeGroup.forEach(p => { if(features[p] !== undefined) features[p] = false; });
                 features['tpA0'] = true;
                 features['ss01'] = features['ss02'] = features['ss03'] = false;
            }
        }

        // Group 2: ss09-ss13 are mutually exclusive
        const group2 = ['ss09', 'ss10', 'ss11', 'ss12', 'ss13'];
        if (group2.includes(changedProp) && newValue) {
            group2.forEach(prop => {
                if (prop !== changedProp && features[prop] !== undefined) {
                    features[prop] = false;
                }
            });
        }

        // Rule 3: ss14 depends on at least one of ss03-ss08 being active
        const dependants = ['ss03', 'ss04', 'ss05', 'ss06', 'ss07', 'ss08'];
        const isDepActive = dependants.some(prop => features[prop]);

        // If the dependencies are NOT met, force ss14 off
        if (!isDepActive && features['ss14']) {
            features['ss14'] = false;
        }

        return features;
    }

    /**
     * Update the DOM to reflect forced state changes (like disabling/unchecking).
     * @param {HTMLElement} container - The toolbox container for all feature blocks
     * @param {Object} features - The current global features state
     */
    static updateUI(container, features) {
        // Enforce typeGroup Default
        const typeGroup = ['tpA0','tpA1','tpA2','tpA3','tpB0','tpB1','tpB2','tpB3', 'rcA2', 'rcB1', 'rcB3'];
        const tpActive = typeGroup.some(prop => features[prop]);
        if (!tpActive) {
            features['tpA0'] = true;
            features['ss01'] = features['ss02'] = features['ss03'] = features['ss04'] = false;
        }

        const dependants = ['ss03', 'ss04', 'ss05', 'ss06', 'ss07', 'ss08'];
        const isDepActive = dependants.some(prop => features[prop]);

        // Manage ss14 disabled state
        const ss14Box = container.querySelector('#ss14Box');
        if (ss14Box) {
            ss14Box.disabled = !isDepActive;
            const featureBlock = ss14Box.closest('feature-block');
            if (featureBlock) {
                featureBlock.style.opacity = isDepActive ? '1' : '0.5';
                featureBlock.style.pointerEvents = isDepActive ? 'auto' : 'none';
            }
        }

        // Ensure all checkboxes sync with the mutually exclusive enforced state
        Object.entries(features).forEach(([prop, val]) => {
            const box = container.querySelector(`#${prop}Box`);
            if (box && box.checked !== val) {
                box.checked = val;
            }
        });
    }
}
