import { lazyLoad } from '../common/index.js';

// Lazy load the WorkflowEditor class
let WorkflowEditorPromise: Promise<typeof import('./workflowEditor.js')> | null = null;

export async function loadWorkflowEditor() {
  if (!WorkflowEditorPromise) {
    WorkflowEditorPromise = lazyLoad(() => import('./workflowEditor.js'));
  }
  return WorkflowEditorPromise;
}

export async function createWorkflowEditor(
  containerElem: HTMLElement,
  workflowObject: any,
  titleInput: HTMLInputElement,
  descriptionInput: HTMLTextAreaElement
) {
  const { WorkflowEditor } = await loadWorkflowEditor();
  return new WorkflowEditor(containerElem, workflowObject, titleInput, descriptionInput);
}

// Preload the WorkflowEditor on user interaction
export function preloadWorkflowEditor() {
  // Preload after a delay to not block initial page load
  setTimeout(() => {
    loadWorkflowEditor().catch(console.error);
  }, 2000);
}

// Intersection Observer for lazy loading workflow editor when needed
export function observeWorkflowEditorContainer(containerElem: HTMLElement) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          loadWorkflowEditor().catch(console.error);
          observer.unobserve(entry.target);
        }
      });
    },
    {
      rootMargin: '50px',
    }
  );

  observer.observe(containerElem);
}