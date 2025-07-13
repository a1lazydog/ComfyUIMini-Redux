// --- Imports ---
// External dependencies
import {
    FinishGenerationMessage,
    PreviewMessage,
    ProgressMessage,
    TotalImagesMessage,
    WorkflowStructureMessage,
} from '@shared/types/WebSocket.js';
import { WorkflowWithMetadata } from '@shared/types/Workflow.js';
import { NodeInputValues } from '@shared/types/SavedInputs.js';
import { WorkflowInstance } from '@shared/classes/Workflow.js';

// Internal modules
import { getLocalWorkflow } from '../modules/getLocalWorkflow.js';
import { renderInputs } from '../modules/workflowInputRenderer.js';
import { SaveInputValues } from '../modules/savedInputValues.js';
import { openPopupWindow, PopupWindowType } from '../common/popupWindow.js';
import { showResolutionSelector } from '../modules/resolutionSelector.js';
import { ProgressBarManager } from '../modules/progressBar.js';

// --- DOM Elements ---
const elements = {
    inputsContainer: document.querySelector('.inputs-container') as HTMLElement,
    outputImagesContainer: document.querySelector('.output-images-container') as HTMLElement,
    runButton: document.querySelector('.run-workflow') as HTMLButtonElement,
    cancelRunButton: document.querySelector('.cancel-run-button') as HTMLButtonElement,
    get allFileInputs() {
        return document.querySelectorAll('.workflow-input-container .file-input') as NodeListOf<HTMLElement>;
    },
    get allSelectsWithImageUploads() {
        return document.querySelectorAll('select.workflow-input.has-image-upload') as NodeListOf<HTMLSelectElement>;
    },
    get allWorkflowInputContainers() {
        return document.querySelectorAll('.workflow-input-container') as NodeListOf<HTMLElement>;
    },
    previousOutputsToggler: document.querySelector('.previous-outputs-toggler') as HTMLElement,
    previousOutputsList: document.querySelector('.previous-outputs-list') as HTMLElement,
    previousOutputsTogglerIcon: document.querySelectorAll('.previous-outputs-toggler-icon') as NodeListOf<HTMLElement>,
    get allResolutionSelectors() {
        return document.querySelectorAll('.resolution-selector-container') as NodeListOf<HTMLElement>;
    },
};

// --- Progress Bar Manager ---
const progressBarManager = new ProgressBarManager();

// --- Variables ---
let previousOutputsLoaded = false;
let isWorkflowRunning = false;

// @ts-expect-error - passedWorkflowIdentifier is fetched via the inline script supplied by EJS
const workflowIdentifier = passedWorkflowIdentifier;
// @ts-expect-error - passedWorkflowType is fetched via the inline script supplied by EJS
const workflowType = passedWorkflowType;

// Workflow data from EJS via inline script tag
// @ts-expect-error - workflowDataFromEjs is fetched via the inline script supplied by EJS
const workflowObject: WorkflowWithMetadata = workflowDataFromEjs ? workflowDataFromEjs : fetchLocalWorkflow();

// --- Initialise WebSocket ---
// Use wss:// when the page is served over HTTPS
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${wsProtocol}//${window.location.host}/ws`);
ws.onopen = () => console.log('Connected to WebSocket client');

// Initialize the page with enhanced progress bar integration
loadWorkflow().then(() => {
    // Pre-initialize progress bar with workflow structure for optimization
    // This allows the progress bar to pre-compute dependency analysis
    if (workflowObject) {
        try {
            const workflowInstance = new WorkflowInstance(workflowObject);
            // Pre-analyze structure without starting progress tracking
            progressBarManager.initializeWithWorkflow(workflowInstance.workflow);
            progressBarManager.reset(); // Reset but keep cached analysis
            console.log('Progress bar pre-initialized with workflow structure');
        } catch (error) {
            console.warn('Failed to pre-initialize progress bar:', error);
        }
    }
});

// Enhanced cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (isWorkflowRunning) {
        // Cancel any running workflow
        fetch('/comfyui/interrupt').catch(() => {});
    }
    progressBarManager.cleanup();
    if (ws.readyState === WebSocket.OPEN) {
        ws.close();
    }
});

async function loadWorkflow() {
    try {
        await renderInputs(workflowObject, workflowType, workflowIdentifier);
        startEventListeners();
    } catch (error) {
        console.error('Failed to load workflow:', error);
        openPopupWindow('Failed to load workflow inputs', PopupWindowType.ERROR, error instanceof Error ? error.message : 'Unknown error');
    }
}

/**
 * Fetches the current local workflow from localStorage.
 * If the workflow is not found, an error is thrown.
 *
 * @returns The workflow object
 */
function fetchLocalWorkflow(): WorkflowWithMetadata {
    const localWorkflow = getLocalWorkflow(workflowIdentifier);

    if (!localWorkflow) {
        const errorMessage = `Workflow '${workflowIdentifier}' not found.`;
        openPopupWindow(errorMessage, PopupWindowType.ERROR);
        throw new Error(errorMessage);
    }

    return localWorkflow;
}

/**
 * Starts the event listeners for the various elements on the page.
 */
function startEventListeners() {
    elements.runButton.addEventListener('click', runWorkflow);
    elements.cancelRunButton.addEventListener('click', cancelRun);

    elements.inputsContainer.addEventListener('click', handleInputContainerClick);

    elements.allFileInputs.forEach((element) => fileUploadEventListener(element));
    elements.allSelectsWithImageUploads.forEach((selectElement) => imageSelectEventListener(selectElement));

    elements.previousOutputsToggler.addEventListener('click', togglePreviousOutputs);

    elements.allResolutionSelectors.forEach((resolutionSelector) =>
        resolutionSelectorEventListener(resolutionSelector)
    );

    // Initialize auto-expand textareas
    initializeAutoExpandTextareas();
}

function resolutionSelectorEventListener(resolutionSelector: HTMLElement) {
    resolutionSelector.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;

        if (!target.classList.contains('resolution-selector-button') && !target.classList.contains('icon')) {
            return;
        }

        let targetParent = target.parentNode;
        if (target.classList.contains('icon')) {
            targetParent = targetParent?.parentNode || null;
        }

        if (!targetParent) {
            console.error('No parent node found');
            return;
        }

        showResolutionSelector((targetParent as HTMLElement).getAttribute('data-node-id') as string);
    });
}

function togglePreviousOutputs() {
    const previousOutputsList = elements.previousOutputsList;

    if (previousOutputsList.classList.contains('hidden')) {
        elements.previousOutputsTogglerIcon.forEach((icon) => icon.classList.add('open'));
        expandElement(previousOutputsList);
        
        // Load previous outputs from API if not already loaded
        if (!previousOutputsLoaded) {
            loadPreviousOutputsFromAPI();
        }
    } else {
        elements.previousOutputsTogglerIcon.forEach((icon) => icon.classList.remove('open'));
        collapseElement(previousOutputsList);
    }
}

/**
 * Collapses an element, element has to have a style for the hidden class variant.
 * @param element The element to collapse.
 */
function collapseElement(element: HTMLElement) {
    element.style.height = `${element.scrollHeight}px`;

    element.classList.add('collapsing');

    requestAnimationFrame(() => {
        element.style.height = '0';
    });

    element.addEventListener('transitionend', function handler() {
        element.classList.add('hidden');
        element.classList.remove('collapsing');

        element.removeEventListener('transitionend', handler);
    });
}

function expandElement(element: HTMLElement) {
    element.classList.add('expanding');
    element.classList.remove('hidden');

    requestAnimationFrame(() => {
        element.style.height = `${element.scrollHeight}px`;
        element.style.opacity = '1';
        element.style.paddingTop = '0.5rem';
        element.style.paddingBottom = '0.5rem';
    });

    element.addEventListener('transitionend', function handler() {
        element.classList.remove('expanding');

        element.removeAttribute('style');
        element.style.height = `auto`;

        element.removeEventListener('transitionend', handler);
    });
}

/**
 * Handles updating the preview for a image select element.
 *
 * @param selectElement The select element to listen to.
 */
function imageSelectEventListener(selectElement: HTMLSelectElement) {
    selectElement.addEventListener('change', (e: Event) => {
        const target = e.target as HTMLSelectElement;

        const selectedOption = target.options[target.selectedIndex];
        const selectedValue = selectedOption.value;

        if (!selectedValue) {
            return;
        }

        const innerInputWrapperElem = target.closest('.inner-input-wrapper');

        if (!innerInputWrapperElem) {
            return;
        }

        const imagePreviewElem = innerInputWrapperElem.querySelector('.input-image-preview') as HTMLImageElement;
        imagePreviewElem.src = `/comfyui/image?filename=${selectedValue}&subfolder=&type=input`;
    });
}

/**
 * Handles uploading an image file to the server for image select inputs.
 *
 * @param inputElement The file input element to listen to.
 */
function fileUploadEventListener(inputElement: HTMLElement) {
    inputElement.addEventListener('change', async (e) => {
        const target = e.target;

        if (!target || !(target instanceof HTMLInputElement)) {
            return;
        }

        if (!target.files) {
            return;
        }

        if (target.files.length > 0) {
            const file = target.files[0];

            const formData = new FormData();
            formData.append('image', file);

            try {
                const response = await fetch('/comfyui/upload/image', {
                    method: 'POST',
                    body: formData,
                });

                const responseJson = await response.json();

                if (responseJson.error) {
                    console.error(responseJson.error);
                }

                const selectId = inputElement.getAttribute('data-select-id');

                if (!selectId) {
                    console.error('No linked select attribute found');
                    return;
                }

                const linkedSelect = document.getElementById(selectId);

                if (!linkedSelect) {
                    console.error('Linked select not found');
                    return;
                }

                addOptionToSelect(linkedSelect as HTMLSelectElement, responseJson.externalResponse.name);
            } catch (err) {
                console.error(err);
            }
        }
    });
}

/**
 * Adds a new select option to a select element.
 * Used to add new images to existing selects when a new image is uploaded for image inputs.
 *
 * @param selectElem The select to add the option to.
 * @param option The option to add.
 */
function addOptionToSelect(selectElem: HTMLSelectElement, option: string) {
    const optionElem = document.createElement('option');
    optionElem.value = option;
    optionElem.textContent = option;

    selectElem.appendChild(optionElem);
}

/**
 * Handles clicks on elements inside the input container.
 *
 * @param event The click mouse event.
 * @returns Nothing.
 */
function handleInputContainerClick(event: MouseEvent) {
    const target = event.target as HTMLElement;

    if (target.classList.contains('randomise-input-toggle')) {
        toggleRandomiseInput(target);
    } else if (target.classList.contains('randomise-now-button')) {
        const parentNode = target.parentNode;

        if (!parentNode) {
            console.error('No parent node found');
            return;
        }

        const linkedInputId = (parentNode as HTMLElement).getAttribute('data-linked-input-id');

        if (!linkedInputId) {
            console.error('No linked input id found');
            return;
        }

        randomiseInput(linkedInputId);
    }
}

/**
 * Toggles on/off the randomisation of an input on workflow run.
 *
 * @param toggleElement The toggle element that was clicked.
 */
function toggleRandomiseInput(toggleElement: HTMLElement) {
    const toggleElemContainer = toggleElement.parentNode as HTMLElement;

    const randomiseOff = toggleElemContainer.classList.contains('randomise-off');

    if (randomiseOff) {
        toggleElemContainer.classList.remove('randomise-off');
    } else {
        toggleElemContainer.classList.add('randomise-off');
    }
}

/**
 * Randomises an input field.
 *
 * @param inputId The input to randomise.
 * @returns Nothing.
 */
function randomiseInput(inputId: string) {
    const input = document.getElementById(inputId);

    if (!input) {
        console.error('Input not found');
        return;
    }

    const min = input.getAttribute('min');
    const max = input.getAttribute('max');
    const step = input.getAttribute('step') || '1';

    let randomNumber;
    if (min && max && max > min) {
        randomNumber = generateRandomNum(parseFloat(min), parseFloat(max), parseFloat(step));
    } else {
        randomNumber = generateSeed();
    }

    (input as HTMLInputElement).value = randomNumber.toString();
}

/**
 * Generates a random number between min and max with a step.
 *
 * @param min The minimum value.
 * @param max The maximum value.
 * @param step The step size i.e. the difference between each number.
 * @returns The random number generated.
 */
function generateRandomNum(min: number, max: number, step: number): number {
    const range = (max - min) / step;
    return Math.min(min + step * Math.floor(Math.random() * range), max);
}

/**
 * Generates a random number seed.
 *
 * @returns A random seed.
 */
function generateSeed() {
    return Math.floor(Math.random() * 1e16)
        .toString()
        .padStart(16, '0');
}



function generateNodeInputValues(): NodeInputValues {
    const collectingInputValues: NodeInputValues = {};

    elements.allWorkflowInputContainers.forEach((inputContainer) => {
        const randomiseButtonsContainer = inputContainer.querySelector('.randomise-buttons-container');

        if (randomiseButtonsContainer) {
            handleInputRandomise(randomiseButtonsContainer);
        }

        const inputElem = inputContainer.querySelector('.workflow-input') as HTMLInputElement;

        const [, nodeId, nodeInputName] = inputElem.id.split('-');

        // Replace user input with date if it's for a string
        // TODO: make this work even if the input was hidden
        const inputValue = (inputElem instanceof HTMLTextAreaElement) ? formatDate(inputElem.value) : inputElem.value;

        if (!collectingInputValues[nodeId]) {
            collectingInputValues[nodeId] = {};
        }

        collectingInputValues[nodeId][nodeInputName] = inputValue;
    });

    return collectingInputValues;
}

function formatDate(template: string) {
    const now = new Date();
    
    const replacements = {
        'yyyy': String(now.getFullYear()),  // Full year (2025)
        'yy': String(now.getFullYear()).slice(-2),  // Last two digits of the year (25)
        'y': String(now.getFullYear()), // Full year, but no leading zeros (2025)
        
        'MM': String(now.getMonth() + 1).padStart(2, '0'), // Month (01-12)
        'M': String(now.getMonth() + 1), // Month without leading zero (1-12)
        
        'dd': String(now.getDate()).padStart(2, '0'), // Day of the month (01-31)
        'd': String(now.getDate()), // Day without leading zero (1-31)

        'HH': String(now.getHours()).padStart(2, '0'), // 24-hour format (00-23)
        'H': String(now.getHours()), // 24-hour without leading zero (0-23)

        'hh': String(now.getHours() % 12 || 12).padStart(2, '0'), // 12-hour format (01-12)
        'h': String(now.getHours() % 12 || 12), // 12-hour without leading zero (1-12)

        'mm': String(now.getMinutes()).padStart(2, '0'), // Minutes (00-59)
        'm': String(now.getMinutes()), // Minutes without leading zero (0-59)

        'ss': String(now.getSeconds()).padStart(2, '0'), // Seconds (00-59)
        's': String(now.getSeconds()), // Seconds without leading zero (0-59)

        'A': now.getHours() >= 12 ? 'PM' : 'AM', // AM/PM uppercase
        'a': now.getHours() >= 12 ? 'pm' : 'am', // AM/PM lowercase

    };

    return template.replace(/%date:([^%]+)%/g, (_, format: string) => {
        return format.replace(/yyyy|yy|y|MM|M|dd|d|HH|H|hh|h|mm|m|ss|s|A|a/g, (match: string) => replacements[match as keyof typeof replacements]);
    });
}

function handleInputRandomise(randomiseButtonContainer: Element) {
    if (randomiseButtonContainer.classList.contains('randomise-off')) {
        return;
    }

    const randomisedInputId = randomiseButtonContainer.getAttribute('data-linked-input-id');

    if (!randomisedInputId) {
        console.error('No linked input id found');
        return;
    }

    randomiseInput(randomisedInputId);
}

export async function runWorkflow() {
    // Set running state for proper cleanup
    isWorkflowRunning = true;
    
    // Reset progress bar (but keep cached analysis if available)
    progressBarManager.reset();

    const filledNodeInputValues = generateNodeInputValues();
    SaveInputValues.fromNodeInputValues(workflowType, workflowIdentifier, filledNodeInputValues);

    const filledWorkflow = new WorkflowInstance(workflowObject).fillWorkflowWithUserInputs(filledNodeInputValues);
    
    // Initialize progress manager with the filled workflow
    // This will use cached analysis if available from pre-initialization
    progressBarManager.initializeWithWorkflow(filledWorkflow);
    
    // Send both workflow and workflow name
    const message = {
        workflow: filledWorkflow,
        workflowName: workflowObject._comfyuimini_meta?.title || workflowIdentifier
    };
    
    try {
        ws.send(JSON.stringify(message));
        elements.cancelRunButton.classList.remove('disabled');
        ws.onmessage = handleWebSocketMessage;
        
        console.log('Workflow execution started with optimized progress tracking');
    } catch (error) {
        console.error('Failed to send workflow:', error);
        isWorkflowRunning = false;
        progressBarManager.reset();
        openPopupWindow('Failed to start workflow execution', PopupWindowType.ERROR);
    }
}

// TODO: Setup type for message for both client and server
function handleWebSocketMessage(event: MessageEvent<any>) {
    try {
        const message = JSON.parse(event.data);

        switch (message.type) {
            case 'workflow_structure':
                handleWorkflowStructure(message.data);
                break;

            case 'progress':
                updateProgressBars(message.data);
                break;

            case 'preview':
                updateImagePreview(message.data);
                break;

            case 'total_images':
                setupImagePlaceholders(message.data);
                break;

            case 'completed':
                finishGeneration(message.data);
                break;

            case 'error':
                // Enhanced error handling with workflow state management
                console.error('WebSocket Error:', message.message);
                isWorkflowRunning = false;
                progressBarManager.reset();
                elements.cancelRunButton.classList.add('disabled');
                openPopupWindow(message.message, PopupWindowType.ERROR);
                break;

            default:
                console.warn('Unknown WebSocket message type:', message.type);
                console.log(message);
                break;
        }
    } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
        console.log('Raw message:', event.data);
    }
}

function handleWorkflowStructure(messageData: WorkflowStructureMessage) {
    // Enhanced workflow structure handling for optimized progress tracking
    console.log('Received enhanced workflow structure:', messageData);
    
    // The progress bar can use this additional server-side information
    // to validate or enhance its structure analysis
    const { totalNodes, outputNodeCount, hasDependencies, nodeTypes, promptId } = messageData;
    
    // Validate that our client-side analysis matches server-side
    const clientTotalNodes = progressBarManager.getTotalNodeCount();
    if (clientTotalNodes !== totalNodes) {
        console.warn(`Node count mismatch: client=${clientTotalNodes}, server=${totalNodes}`);
        // The optimized progress bar will handle this gracefully
    }
    
    // Log enhanced workflow information for debugging
    if (hasDependencies !== undefined) {
        console.log(`Workflow complexity: ${hasDependencies ? 'has dependencies' : 'simple workflow'}`);
    }
    
    if (nodeTypes) {
        const typesSummary = Object.entries(nodeTypes)
            .map(([type, count]) => `${count}x ${type}`)
            .join(', ');
        console.log(`Node types: ${typesSummary}`);
    }
    
    console.log(`Workflow structure confirmed: ${totalNodes} nodes, ${outputNodeCount} output nodes`);
    
    if (promptId) {
        console.log(`Prompt ID: ${promptId}`);
    }
}

function updateProgressBars(messageData: ProgressMessage) {
    // Enhanced progress update with structure-aware calculations
    progressBarManager.updateProgressBars(messageData);
}

function updateImagePreview(messageData: PreviewMessage) {
    const currentSkeletonLoaderElem =
        elements.outputImagesContainer.querySelectorAll('.image-placeholder-skeleton')[0];

    if (!currentSkeletonLoaderElem) {
        return;
    }

    let previewImageElem: HTMLImageElement = currentSkeletonLoaderElem.querySelector('.preview') as HTMLImageElement;
    if (!previewImageElem) {
        previewImageElem = document.createElement('img');
        previewImageElem.classList.add('preview');
        previewImageElem.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        // Empty image to ensure no flicker between when element is loaded and src is set

        currentSkeletonLoaderElem.appendChild(previewImageElem);
    }

    previewImageElem.src = `data:${messageData.mimetype};base64,${messageData.image}`;
}

function setupImagePlaceholders(messageData: TotalImagesMessage) {
    // Create placeholders for the expected number of output images
    elements.outputImagesContainer.innerHTML = `<div class="image-placeholder-skeleton"></div>`.repeat(messageData);
}

async function loadPreviousOutputsFromAPI() {
    try {
        const workflowName = workflowObject._comfyuimini_meta?.title || workflowIdentifier;
        const encodedWorkflowName = encodeURIComponent(workflowName);
        
        const response = await fetch(`/api/queue/completed/${encodedWorkflowName}`);
        if (!response.ok) {
            throw new Error('Failed to fetch previous outputs');
        }
        
        const completedItems = await response.json();
        
        // Clear existing content
        elements.previousOutputsList.innerHTML = '';
        
        // Load images for each completed item
        for (const item of completedItems) {
            await loadImagesForCompletedItem(item);
        }
        
        previousOutputsLoaded = true;
    } catch (error) {
        console.error('Error loading previous outputs:', error);
        elements.previousOutputsList.innerHTML = '<div class="error-message">Failed to load previous outputs</div>';
    }
}

async function loadImagesForCompletedItem(item: any) {
    try {
        const promptId = item[1];
        if (!promptId) return;
        
        // Fetch history for the completed item to get the generated images
        const response = await fetch(`/comfyui/history/${promptId}`);
        if (!response.ok) return;
        
        const historyData = await response.json();
        
        if (historyData[promptId] && historyData[promptId].outputs) {
            // Extract image URLs from the history response
            Object.values(historyData[promptId].outputs).forEach((output: any) => {
                if (output.images) {
                    output.images.forEach((image: any) => {
                        const imageUrl = `/comfyui/image?filename=${image.filename}&subfolder=${image.subfolder}&type=output`;
                        addItemToPreviousOutputsListElem(imageUrl);
                    });
                }
            });
        }
    } catch (error) {
        console.error('Error loading images for completed item:', error);
    }
}

function addItemToPreviousOutputsListElem(imageUrl: string) {
    elements.previousOutputsList.innerHTML =
        `
        <a href="${imageUrl}" target="_blank" class="previous-output-item">
            <img src="${imageUrl}" alt="Previously generated image" class="previous-output-img" loading="lazy">
        </a>
    ` + elements.previousOutputsList.innerHTML;
}

function finishGeneration(messageData: FinishGenerationMessage) {
    // Mark workflow as no longer running
    isWorkflowRunning = false;
    
    // Complete progress bar with optimized final update
    progressBarManager.complete();
    
    elements.cancelRunButton.classList.add('disabled');

    // Extract all image URLs from the message data
    // messageData is Record<string, string[]> where keys are node IDs and values are arrays of image URLs
    const allImageUrls: string[] = [];
    Object.values(messageData).forEach((imageUrlArray) => {
        if (Array.isArray(imageUrlArray)) {
            allImageUrls.push(...imageUrlArray);
        }
    });

    elements.outputImagesContainer.innerHTML = allImageUrls.map(urlToImageElem).join('');
    
    // Refresh previous outputs if they are currently loaded/visible
    if (previousOutputsLoaded && !elements.previousOutputsList.classList.contains('hidden')) {
        // Reset the loaded flag so it will reload fresh data
        previousOutputsLoaded = false;
        loadPreviousOutputsFromAPI();
    }
    
    console.log('Workflow generation completed successfully');
}

function urlToImageElem(imageUrl: string) {
    return `<a href="${imageUrl}" target="_blank"><img src="${imageUrl}" class="output-image"></a>`;
}

export function cancelRun() {
    if (elements.cancelRunButton.classList.contains('disabled')) {
        return;
    }

    // Enhanced cancellation with proper state management
    isWorkflowRunning = false;
    
    // Reset progress bar to clear any pending updates
    progressBarManager.reset();
    
    fetch('/comfyui/interrupt').catch((error) => {
        console.warn('Failed to send interrupt signal:', error);
    });
    
    elements.cancelRunButton.classList.add('disabled');
    
    console.log('Workflow execution cancelled');
}

/**
 * Initializes auto-expand functionality for textareas with the auto-expand class.
 * Makes textareas automatically resize to fit their content.
 */
function initializeAutoExpandTextareas() {
    const autoExpandTextareas = document.querySelectorAll('textarea.workflow-input.auto-expand') as NodeListOf<HTMLTextAreaElement>;
    
    autoExpandTextareas.forEach(textarea => {
        // Set initial height
        adjustTextareaHeight(textarea);
        
        // Add event listeners for input and focus
        textarea.addEventListener('input', () => adjustTextareaHeight(textarea));
        textarea.addEventListener('focus', () => adjustTextareaHeight(textarea));
    });
}

/**
 * Adjusts the height of a textarea to fit its content.
 * @param textarea The textarea element to adjust
 */
function adjustTextareaHeight(textarea: HTMLTextAreaElement) {
    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto';
    
    // Set height to scrollHeight to fit content
    textarea.style.height = `${textarea.scrollHeight}px`;
}

loadWorkflow().catch(error => {
    console.error('Failed to initialize workflow:', error);
});
