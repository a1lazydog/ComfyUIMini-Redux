import { openInputImagesModal } from '../common/inputImagesModal.js';
import { generateInputId } from '../common/utils.js';
import { toImageFromComfyUIUrl, toImageFromRelativeUrl, toComfyUIUrlFromImage, toRelativeFromImage, Image, ImageType } from '../common/image.js';

export interface ImageRenderConfig {
    node_id: string;
    input_name_in_node: string;
    title: string;
    default: string;
    list: string[];
}

/**
 * Creates a consistent input container HTML structure
 * @param id The input ID
 * @param title The input title/label
 * @param inputHtml The HTML content for the input
 * @param additionalClass Optional additional CSS class
 * @returns The complete input container HTML
 */
const createInputContainer = (id: string, title: string, inputHtml: string, additionalClass?: string): string => `
    <div class="workflow-input-container${additionalClass ? ' ' + additionalClass : ''}">
        <label for="${id}">${title}</label>
        <div class="inner-input-wrapper">
            ${inputHtml}
        </div>
    </div>
`;

/**
 * Renders an image input with modal selection and upload functionality.
 * @param {ImageRenderConfig} inputOptions Options for the image input.
 * @returns {string}
 */
export function renderImageInput(inputOptions: ImageRenderConfig): string {
    const id = generateInputId(inputOptions.node_id, inputOptions.input_name_in_node);

    // Parse the default value to determine the image type and original filename
    const imageObj = toImageFromRelativeUrl(inputOptions.default);
    
    // Create a hidden input to store the selected value
    const hiddenInput = `<input type="hidden" id="${id}" class="workflow-input" value="${inputOptions.default}" data-original-filename="${inputOptions.default}" data-original-type="${imageObj.type}">`;
    
    // Create the display button and preview
    const displayButton = `<button type="button" id="${id}-select-button" class="workflow-input image-select-button" data-fallback-images='${JSON.stringify(inputOptions.list || [])}'>
        <span class="icon gallery"></span>
        <span class="button-text">Select</span>
    </button>`;
    
    const uploadButton = `<button type="button" id="${id}-upload-button" class="workflow-input image-upload-button">
        <span class="icon upload"></span>
        <span class="button-text">Upload</span>
    </button>
    <input type="file" id="${id}-file_input" data-select-id="${id}" class="file-input" accept="image/jpeg,image/png,image/webp">`;
    
    // Create image preview using the utility function
    const imagePreview = `<img src="${toComfyUIUrlFromImage(imageObj)}" class="input-image-preview ${inputOptions.default ? '' : 'hidden'}" id="${id}-preview" onerror="this.classList.add('hidden'); this.nextElementSibling.classList.remove('hidden');" onload="this.classList.remove('hidden'); this.nextElementSibling.classList.add('hidden');">
    <div class="input-image-placeholder ${inputOptions.default ? 'hidden' : ''}" id="${id}-placeholder">
        <div class="placeholder-content">
            <span class="icon gallery"></span>
            <span class="placeholder-text">Select an image</span>
        </div>
    </div>`;

    const html = `
        ${hiddenInput}
        <div class="image-input-controls">
            ${displayButton}
            ${uploadButton}
            <!-- Edit Mask button removed -->
        </div>
        ${imagePreview}
    `;

    return createInputContainer(
        id,
        inputOptions.title,
        html,
        'has-image-upload'
    );
}

export async function uploadImageFile(file: File, subfolder?: string, type: ImageType = 'input', overwrite?: boolean): Promise<Image> {
    const formData = new FormData();
    formData.append('image', file);
    
    if (subfolder) {
        formData.append('subfolder', subfolder);
    }
    formData.append('type', type);
    
    if (overwrite) {
        formData.append('overwrite', 'true');
    }

    const response = await fetch('/comfyui/upload/image', {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        throw new Error('Upload failed');
    }

    const result = await response.json();
    
    // Try different possible locations for the filename
    let filename = result.name || result.filename || result.externalResponse?.name || result.externalResponse?.filename;
    
    // If still no filename, try to get it from the file object
    if (!filename) {
        filename = file.name;
    }

    return {
        filename,
        subfolder: subfolder || undefined,
        type
    };
}



// Function to create preview with mask overlay
export async function createPreviewWithMaskOverlay(previewImg: HTMLImageElement, imageSrc: string, originalType?: ImageType, originalSubfolder?: string) {
        try {
            // Check if this is a masked image (contains clipspace)
            const isMaskedImage = imageSrc.includes('clipspace');
            
            if (isMaskedImage) {
                // For masked images, we need to load the original image and overlay the mask
                // Extract the original image filename and type from the masked image URL
                const { filename: maskedFilename, type: maskedType } = toImageFromComfyUIUrl(imageSrc);
                if (!maskedFilename) {
                    previewImg.src = imageSrc;
                    return;
                }
                
                // Remove _mask suffix to get original filename
                let originalFilename = decodeURIComponent(maskedFilename);
                
                // Handle different mask filename patterns
                if (originalFilename.includes('_mask')) {
                    // Remove _mask and any numbers/spaces before .png
                    originalFilename = originalFilename.replace(/_mask\s*\(\d+\)\.png$/, '.png');
                    // If that didn't work, try a simpler replacement
                    if (originalFilename.includes('_mask')) {
                        originalFilename = originalFilename.replace('_mask.png', '.png');
                    }
                }
                
                // Load the original image
                const originalImg = new Image();
                originalImg.crossOrigin = 'anonymous';
                
                // Use the passed originalType if available, otherwise fall back to maskedType
                const typeToUse = originalType || maskedType;
                // Use the passed originalSubfolder if available, otherwise use the masked image's subfolder
                const subfolderToUse = originalSubfolder || (toImageFromComfyUIUrl(imageSrc).subfolder);
                const originalImageUrl = toComfyUIUrlFromImage({
                    filename: originalFilename,
                    subfolder: subfolderToUse,
                    type: typeToUse
                });
                
                originalImg.onload = () => {
                    // Create canvas for the result
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d')!;
                    canvas.width = originalImg.width;
                    canvas.height = originalImg.height;
                    
                    // Load the masked image
                    const maskedImg = new Image();
                    maskedImg.crossOrigin = 'anonymous';
                    
                    maskedImg.onload = () => {
                        // Draw the original image first
                        ctx.drawImage(originalImg, 0, 0);
                        
                        // Get the masked image data to check for alpha
                        const tempCanvas = document.createElement('canvas');
                        tempCanvas.width = maskedImg.width;
                        tempCanvas.height = maskedImg.height;
                        const tempCtx = tempCanvas.getContext('2d')!;
                        tempCtx.drawImage(maskedImg, 0, 0);
                        const maskedData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
                        
                        // Add red overlay where there's transparency in the masked image
                        for (let i = 0; i < maskedData.data.length; i += 4) {
                            const alpha = maskedData.data[i + 3];
                            const transparency = 255 - alpha; // How transparent the pixel is
                            
                            if (transparency > 0) {
                                // Add red overlay where there's transparency
                                ctx.fillStyle = `rgba(255, 0, 0, ${Math.min(transparency / 255, 0.5)})`;
                                ctx.fillRect(
                                    (i / 4) % canvas.width, 
                                    Math.floor((i / 4) / canvas.width), 
                                    1, 1
                                );
                            }
                        }
                        
                        // Convert to data URL and set as preview
                        const dataUrl = canvas.toDataURL('image/png');
                        previewImg.src = dataUrl;
                    };
                    
                    maskedImg.onerror = (error) => {
                        console.error('Error loading masked image:', error);
                        console.error('Failed masked image URL:', imageSrc);
                        // Fallback to original image
                        ctx.drawImage(originalImg, 0, 0);
                        const dataUrl = canvas.toDataURL('image/png');
                        previewImg.src = dataUrl;
                    };
                    
                    // Load the masked image
                    maskedImg.src = imageSrc;
                };
                
                originalImg.onerror = (error) => {
                    console.error('Error loading original image:', error);
                    console.error('Failed originalImageUrl:', originalImageUrl);
                    console.error('Original filename:', originalFilename);
                    // Fallback to masked image
                    previewImg.src = imageSrc;
                };
                
                originalImg.src = originalImageUrl;
            } else {
                // For non-masked images, just load normally
                const img = new Image();
                img.crossOrigin = 'anonymous';
                
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d')!;
                    canvas.width = img.width;
                    canvas.height = img.height;
                    ctx.drawImage(img, 0, 0);
                    const dataUrl = canvas.toDataURL('image/png');
                    previewImg.src = dataUrl;
                };
                
                img.onerror = (error) => {
                    console.error('Error loading image:', error);
                    previewImg.src = imageSrc;
                };
                
                img.src = imageSrc;
            }
        } catch (error) {
            console.error('Error creating mask overlay:', error);
            // Fallback to original image if there's an error
            previewImg.src = imageSrc;
        }
    }

    // Handle image selection button clicks and placeholder clicks
    document.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const selectButton = target.closest('.image-select-button') as HTMLButtonElement;
        const placeholder = target.closest('.input-image-placeholder') as HTMLElement;
        
        if (selectButton || placeholder) {
            e.preventDefault();
            let inputId: string;
            
            if (selectButton) {
                inputId = selectButton.id.replace('-select-button', '');
            } else if (placeholder) {
                inputId = placeholder.id.replace('-placeholder', '');
            } else {
                return;
            }
            
            const hiddenInput = document.getElementById(inputId) as HTMLInputElement;
            const previewImg = document.getElementById(`${inputId}-preview`) as HTMLImageElement;

            // Find the inputOptions.list for this input (by DOM traversal)
            // We'll store the list as a data attribute on the select button for easy access
            let fallbackImages: string[] = [];
            const selectButtonForInput = document.getElementById(`${inputId}-select-button`) as HTMLButtonElement;
            if (selectButtonForInput?.dataset.fallbackImages) {
                try {
                    fallbackImages = JSON.parse(selectButtonForInput.dataset.fallbackImages);
                } catch {
                    // Ignore JSON parse errors, fallbackImages will remain empty array
                }
            }
            
            if (!hiddenInput) return;
            
            await openInputImagesModal({
                onImageSelect: (image: Image) => {
                    // Create the full filename for storage using the utility function
                    const fullFilename = toRelativeFromImage(image);
                    
                    // Update the hidden input value
                    hiddenInput.value = fullFilename;
                    
                    // Update the original filename attribute for mask editing
                    hiddenInput.setAttribute('data-original-filename', fullFilename);
                    hiddenInput.setAttribute('data-original-type', image.type);
                    
                    // Update the preview image with mask overlay
                    if (previewImg) {
                        const imageUrl = toComfyUIUrlFromImage(image);
                        createPreviewWithMaskOverlay(previewImg, imageUrl);
                        previewImg.classList.remove('hidden');

                        // Hide placeholder
                        const placeholder = previewImg.nextElementSibling as HTMLElement;
                        if (placeholder && placeholder.classList.contains('input-image-placeholder')) {
                            placeholder.classList.add('hidden');
                        }
                    }

                    // Trigger change event on the hidden input
                    hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
                },
                fallbackImages
            });
        }
    });

    // Handle upload button clicks
    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const uploadButton = target.closest('.image-upload-button') as HTMLButtonElement;
        
        if (uploadButton) {
            e.preventDefault();
            const inputId = uploadButton.id.replace('-upload-button', '');
            const fileInput = document.getElementById(`${inputId}-file_input`) as HTMLInputElement;
            
            if (fileInput) {
                fileInput.click();
            }
        }
    });

    // Handle file uploads
    document.addEventListener('change', async (e) => {
        const target = e.target as HTMLInputElement;
        
        if (target.classList.contains('file-input')) {
            const file = target.files?.[0];
            if (!file) return;

            const inputId = target.getAttribute('data-select-id');
            if (!inputId) return;

            const hiddenInput = document.getElementById(inputId) as HTMLInputElement;
            const previewImg = document.getElementById(`${inputId}-preview`) as HTMLImageElement;

            try {
                const imageData = await uploadImageFile(file);

                // Create the full filename for storage using the utility function
                const fullFilename = toRelativeFromImage(imageData);

                // Update the hidden input value
                hiddenInput.value = fullFilename;

                // Update the original filename attribute for mask editing
                hiddenInput.setAttribute('data-original-filename', fullFilename);
                hiddenInput.setAttribute('data-original-type', imageData.type);

                // Update the preview image with mask overlay
                if (previewImg) {
                    const imageUrl = toComfyUIUrlFromImage(imageData);
                    createPreviewWithMaskOverlay(previewImg, imageUrl);
                    previewImg.classList.remove('hidden');
                    
                    // Hide placeholder
                    const placeholder = previewImg.nextElementSibling as HTMLElement;
                    if (placeholder && placeholder.classList.contains('input-image-placeholder')) {
                        placeholder.classList.add('hidden');
                    }
                }

                // Trigger change event on the hidden input
                hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));

                // Update the data-fallback-images attribute on the select button
                const selectButton = document.getElementById(`${inputId}-select-button`) as HTMLButtonElement;
                if (selectButton) {
                    const currentFallbackImages = JSON.parse(selectButton.dataset.fallbackImages || '[]');
                    const updatedFallbackImages = [...new Set([...currentFallbackImages, fullFilename])];
                    selectButton.dataset.fallbackImages = JSON.stringify(updatedFallbackImages);
                }

            } catch (error) {
                console.error('Upload failed:', error);
            }

            // Clear the file input
            target.value = '';
        }
    });

// Function to set up image input event listeners
export function setupImageInputEventListeners() {
    // Add event handler for clicking the image preview (mouse and touch)
    const handleImagePreviewClick = async (e: Event) => {
        const target = e.target as HTMLElement;
        
        if (target.classList.contains('input-image-preview') && !target.classList.contains('hidden')) {
            const previewImg = target as HTMLImageElement;
            const inputId = previewImg.id.replace('-preview', '');
            const hiddenInput = document.getElementById(inputId) as HTMLInputElement;
            if (!hiddenInput) return;
            
            // Get the original filename and type from the data attributes
            const originalFilename = hiddenInput.getAttribute('data-original-filename');
            const originalType = hiddenInput.getAttribute('data-original-type') as ImageType;
            
            if (!originalFilename) {
                console.error('Missing data-original-filename attribute for mask editing');
                return;
            }
            
            if (!originalType) {
                console.error('Missing data-original-type attribute for mask editing');
                return;
            }
            
            // Parse the original filename using the new utility function
            const originalImageData = toImageFromRelativeUrl(originalFilename, originalType);
            
            // Dynamically import the modal
            const { openMaskCreationModal } = await import('../common/maskCreationModal.js');
            
            // Parse the mask image if it exists
            let maskImage: Image | undefined;
            if (hiddenInput.value && hiddenInput.value !== originalFilename) {
                maskImage = toImageFromRelativeUrl(hiddenInput.value);
            }
            
            openMaskCreationModal({
                image: originalImageData,
                maskImage,
                onMaskCreated: (newFilename: string) => {
                    hiddenInput.value = toRelativeFromImage(toImageFromComfyUIUrl(newFilename));
                    createPreviewWithMaskOverlay(previewImg, newFilename, originalImageData.type, originalImageData.subfolder);
                    previewImg.classList.remove('hidden');
                    const placeholder = previewImg.nextElementSibling as HTMLElement;
                    if (placeholder && placeholder.classList.contains('input-image-placeholder')) {
                        placeholder.classList.add('hidden');
                    }
                    hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
                },
            });
        }
    };

    // Add both click and touchstart event listeners for cross-platform compatibility
    document.addEventListener('click', handleImagePreviewClick);
    document.addEventListener('touchstart', handleImagePreviewClick, { passive: false });
    
    // Also attach listeners directly to existing image previews
    const existingImagePreviews = document.querySelectorAll('.input-image-preview');
    existingImagePreviews.forEach(img => {
        img.addEventListener('click', handleImagePreviewClick);
        img.addEventListener('touchstart', handleImagePreviewClick, { passive: false });
    });
} 