export default class FeatureInteractionManager {
    /**
     * Initialize UI layout: hide specific features and insert dividers.
     * @param {HTMLElement} container - The toolbox container
     */
    static initializeUI(container) {
        // Hide 'aalt' and 'salt'
        ['aaltBox', 'saltBox'].forEach(id => {
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
        // Group 1: ss01-ss08 are mutually exclusive
        const group1 = ['ss01', 'ss02', 'ss03', 'ss04', 'ss05', 'ss06', 'ss07', 'ss08'];
        if (group1.includes(changedProp) && newValue) {
            group1.forEach(prop => {
                if (prop !== changedProp && features[prop] !== undefined) {
                    features[prop] = false;
                }
            });
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
