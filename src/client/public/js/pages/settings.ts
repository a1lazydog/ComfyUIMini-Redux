import { getConfig, setConfig } from '../common/configLoader.js';
import { openPopupWindow, PopupWindowType } from '../common/popupWindow.js';
import { clearAllSavedInputValues } from '../modules/savedInputValues.js';

const themeSelectElem = document.getElementById('select-theme') as HTMLSelectElement;
const saveGalleryItemsPerPageButton = document.getElementById('set-gallery-items-per-page') as HTMLButtonElement;
const clearSavedInputValuesButton = document.getElementById('clear-saved-input-values') as HTMLButtonElement;
const updateWorkflowMetadataButton = document.getElementById('update-workflow-metadata') as HTMLButtonElement;
const compensatePreviewSaturationCheckbox = document.getElementById(
    'compensate-preview-saturation'
) as HTMLInputElement;

const allTooltipElems = document.querySelectorAll('[data-tooltip]');

allTooltipElems.forEach((elem) => {
    elem.addEventListener('click', () => {
        openPopupWindow((elem as HTMLElement).dataset.tooltip ?? '', PopupWindowType.INFO);
    });
});

themeSelectElem.addEventListener('change', async (e) => {
    if (!e.target) {
        console.error('No target found for theme select element.');
        return;
    }

    const selectedTheme = (e.target as HTMLSelectElement).value;

    const response = await fetch(`/setsetting/theme?theme=${selectedTheme}`);

    const responseText = await response.text();

    if (response.status === 200) {
        location.reload();
    } else {
        openPopupWindow(responseText, PopupWindowType.ERROR);
    }
});

saveGalleryItemsPerPageButton.addEventListener('click', async (e) => {
    if (!e.target) {
        console.error('No target found for save gallery items per page button.');
        return;
    }

    const inputElement = document.getElementById('gallery-items-per-page') as HTMLInputElement;
    const galleryItemsPerPage = inputElement.value;

    const response = await fetch(`/setsetting/galleryitemsperpage?count=${galleryItemsPerPage}`);
    const responseJson = await response.json();

    if (response.status === 200) {
        openPopupWindow(responseJson.message, PopupWindowType.INFO);
    } else {
        openPopupWindow(responseJson.error, PopupWindowType.ERROR);
    }
});

clearSavedInputValuesButton.addEventListener('click', () => {
    try {
        clearAllSavedInputValues();
        openPopupWindow('Cleared all saved input values.', PopupWindowType.INFO);
    } catch (error) {
        openPopupWindow('An error occured while clearing saved input values', PopupWindowType.ERROR, error);
    }
});

updateWorkflowMetadataButton.addEventListener('click', async () => {
    try {
        // Disable button during update
        updateWorkflowMetadataButton.disabled = true;
        updateWorkflowMetadataButton.value = 'Updating...';
        
        const response = await fetch('/api/workflows/update-metadata', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            let message = result.message;
            if (result.updated.length > 0) {
                message += '\n\nUpdated files:\n' + result.updated.join('\n');
            }
            if (result.errors.length > 0) {
                message += '\n\nErrors:\n' + result.errors.join('\n');
            }
            openPopupWindow(message, PopupWindowType.INFO);
        } else {
            openPopupWindow(result.error || 'Failed to update workflow metadata', PopupWindowType.ERROR);
        }
    } catch (error) {
        openPopupWindow('An error occurred while updating workflow metadata', PopupWindowType.ERROR, error);
    } finally {
        // Re-enable button
        updateWorkflowMetadataButton.disabled = false;
        updateWorkflowMetadataButton.value = 'Update workflow metadata';
    }
});

compensatePreviewSaturationCheckbox.addEventListener('change', () => {
    const checked = compensatePreviewSaturationCheckbox.checked;

    setConfig('workflow.compensatePreviewSaturation', checked);
});

function loadConfigsIntoPage() {
    const saturationCompensationConfig = getConfig('workflow.compensatePreviewSaturation') as boolean;

    if (saturationCompensationConfig === true || saturationCompensationConfig === undefined) {
        compensatePreviewSaturationCheckbox.checked = true;
    }
}

loadConfigsIntoPage();
