import { ProgressMessage } from '@shared/types/WebSocket.js';
import { Workflow } from '@shared/types/Workflow.js';

export interface ProgressBarElements {
    current: {
        innerElem: HTMLElement;
        textElem: HTMLElement;
    };
    total: {
        innerElem: HTMLElement;
        textElem: HTMLElement;
    };
}

export interface WorkflowNode {
    id: string;
    class_type: string;
    inputs: Record<string, any>;
}

interface NodeDependencyInfo {
    id: string;
    dependencies: string[];
    dependents: string[];
    depth: number;
}

export class ProgressBarManager {
    private elements: ProgressBarElements;
    private workflow: Workflow | null = null;
    private totalNodes: number = 0;
    private completedNodes: number = 0;
    private currentNodeProgress: number = 0;
    private currentNodeMax: number = 1;
    private nodeDepthMap: Map<string, NodeDependencyInfo> = new Map();
    private maxDepth: number = 0;

    constructor() {
        this.elements = {
            current: {
                innerElem: document.querySelector('.current-image-progress .progress-bar-inner') as HTMLElement,
                textElem: document.querySelector('.current-image-progress .progress-bar-text') as HTMLElement,
            },
            total: {
                innerElem: document.querySelector('.total-images-progress .progress-bar-inner') as HTMLElement,
                textElem: document.querySelector('.total-images-progress .progress-bar-text') as HTMLElement,
            },
        };
    }

    /**
     * Analyzes the workflow to build a dependency graph and calculate node depths
     */
    private analyzeWorkflowStructure(workflow: Workflow): void {
        this.nodeDepthMap.clear();
        this.maxDepth = 0;

        // First pass: identify all nodes and their direct dependencies
        const nodeMap = new Map<string, NodeDependencyInfo>();
        
        for (const [nodeId, node] of Object.entries(workflow)) {
            const dependencies: string[] = [];
            
            // Analyze inputs to find dependencies
            if (node.inputs) {
                for (const inputValue of Object.values(node.inputs)) {
                    if (Array.isArray(inputValue) && inputValue.length >= 2) {
                        const dependencyNodeId = inputValue[0];
                        if (typeof dependencyNodeId === 'string' && workflow[dependencyNodeId]) {
                            dependencies.push(dependencyNodeId);
                        }
                    }
                }
            }

            nodeMap.set(nodeId, {
                id: nodeId,
                dependencies,
                dependents: [],
                depth: 0
            });
        }

        // Second pass: build dependent relationships
        for (const nodeInfo of nodeMap.values()) {
            for (const depId of nodeInfo.dependencies) {
                const depNode = nodeMap.get(depId);
                if (depNode) {
                    depNode.dependents.push(nodeInfo.id);
                }
            }
        }

        // Third pass: calculate depths using topological sort
        const visited = new Set<string>();
        const calculateDepth = (nodeId: string): number => {
            if (visited.has(nodeId)) {
                return nodeMap.get(nodeId)?.depth || 0;
            }

            visited.add(nodeId);
            const nodeInfo = nodeMap.get(nodeId);
            if (!nodeInfo) return 0;

            let maxDepth = 0;
            for (const depId of nodeInfo.dependencies) {
                maxDepth = Math.max(maxDepth, calculateDepth(depId) + 1);
            }

            nodeInfo.depth = maxDepth;
            this.maxDepth = Math.max(this.maxDepth, maxDepth);
            return maxDepth;
        };

        for (const nodeId of nodeMap.keys()) {
            calculateDepth(nodeId);
        }

        this.nodeDepthMap = nodeMap;
    }

    /**
     * Estimates which nodes should be considered complete based on current progress
     */
    private estimateCompletedNodes(): number {
        if (this.nodeDepthMap.size === 0 || this.totalNodes === 0) {
            return this.completedNodes;
        }

        // Check if this is a simple workflow (no dependencies)
        const hasAnyDependencies = Array.from(this.nodeDepthMap.values()).some(node => node.dependencies.length > 0);
        
        if (!hasAnyDependencies) {
            // For simple workflows without dependencies, use the old logic
            return this.completedNodes;
        }

        // For complex workflows with dependencies, use structure-aware calculation
        const nodesPerDepth = new Map<number, number>();
        for (const nodeInfo of this.nodeDepthMap.values()) {
            nodesPerDepth.set(nodeInfo.depth, (nodesPerDepth.get(nodeInfo.depth) || 0) + 1);
        }

        // If we have current progress, estimate how many nodes should be complete
        // based on the assumption that nodes in earlier depths are processed first
        const currentProgressRatio = this.currentNodeMax > 0 ? 
            (this.currentNodeProgress / this.currentNodeMax) : 0;
        
        let estimatedCompleted = 0;
        let progressAccumulator = 0;
        const totalProgress = this.completedNodes + currentProgressRatio;
        const progressPerNode = 1.0 / this.totalNodes;

        // Process nodes by depth (earlier depths first)
        for (let depth = 0; depth <= this.maxDepth; depth++) {
            const nodesAtDepth = nodesPerDepth.get(depth) || 0;
            
            for (let i = 0; i < nodesAtDepth; i++) {
                progressAccumulator += progressPerNode;
                if (progressAccumulator <= totalProgress) {
                    estimatedCompleted++;
                } else {
                    break;
                }
            }
            
            if (progressAccumulator > totalProgress) {
                break;
            }
        }

        return Math.min(estimatedCompleted, this.totalNodes);
    }

    /**
     * Initializes the progress manager with workflow information
     * @param workflow The workflow to track progress for
     */
    initializeWithWorkflow(workflow: Workflow): void {
        this.workflow = workflow;
        this.totalNodes = Object.keys(workflow).length;
        this.completedNodes = 0;
        this.currentNodeProgress = 0;
        this.currentNodeMax = 1;
        
        // Analyze workflow structure for better progress tracking
        this.analyzeWorkflowStructure(workflow);
        
        this.updateTotalProgress();
    }

    /**
     * Resets the progress bars to 0% and resets counters
     */
    reset(): void {
        this.setProgressBar('current', '0%');
        this.setProgressBar('total', '0%');
        this.workflow = null;
        this.totalNodes = 0;
        this.completedNodes = 0;
        this.currentNodeProgress = 0;
        this.currentNodeMax = 1;
        this.nodeDepthMap.clear();
        this.maxDepth = 0;
    }

    /**
     * Updates a progress bar with a new percentage.
     * Percentage should include the % symbol.
     *
     * @param type Which progress bar to change.
     * @param percentage What percentage to set the progress bar to.
     */
    setProgressBar(type: 'total' | 'current', percentage: string): void {
        const textElem = type === 'total' ? this.elements.total.textElem : this.elements.current.textElem;
        const barElem = type === 'total' ? this.elements.total.innerElem : this.elements.current.innerElem;

        textElem.textContent = percentage;
        barElem.style.width = percentage;
    }

    /**
     * Updates progress bars based on WebSocket progress message
     * @param messageData The progress message data
     */
    updateProgressBars(messageData: ProgressMessage): void {
        this.currentNodeProgress = messageData.value;
        this.currentNodeMax = messageData.max;

        // Update current node progress
        const currentProgress = this.currentNodeMax > 0 ? 
            `${Math.round((this.currentNodeProgress / this.currentNodeMax) * 100)}%` : '0%';
        this.setProgressBar('current', currentProgress);

        // Check if current node is complete
        if (this.currentNodeProgress >= this.currentNodeMax && this.currentNodeMax > 0) {
            this.completedNodes += 1;
            this.completedNodes = Math.min(this.completedNodes, this.totalNodes);
        }

        // Update total progress
        this.updateTotalProgress();
    }

    /**
     * Updates the total progress based on workflow structure and current node progress
     */
    private updateTotalProgress(): void {
        if (this.totalNodes === 0) return;

        let totalProgress: number;

        // Check if we should use structure-aware calculation
        const hasAnyDependencies = this.nodeDepthMap.size > 0 && 
            Array.from(this.nodeDepthMap.values()).some(node => node.dependencies.length > 0);

        if (hasAnyDependencies) {
            // Use structure-aware progress calculation for complex workflows
            const estimatedCompleted = this.estimateCompletedNodes();
            totalProgress = Math.min(estimatedCompleted / this.totalNodes, 1);
        } else {
            // Fallback to simple calculation for workflows without dependencies
            const completedProgress = this.completedNodes / this.totalNodes;
            const currentNodeProgress = this.currentNodeMax > 0 ? 
                (this.currentNodeProgress / this.currentNodeMax) / this.totalNodes : 0;
            totalProgress = Math.min(completedProgress + currentNodeProgress, 1);
        }
        
        const totalPercentage = `${Math.round(totalProgress * 100)}%`;
        this.setProgressBar('total', totalPercentage);
    }

    /**
     * Sets both progress bars to 100% (used when generation completes)
     */
    complete(): void {
        this.setProgressBar('current', '100%');
        this.setProgressBar('total', '100%');
    }

    /**
     * Gets the current total node count
     * @returns The total node count
     */
    getTotalNodeCount(): number {
        return this.totalNodes;
    }

    /**
     * Gets the current completed node count
     * @returns The completed node count
     */
    getCompletedNodeCount(): number {
        return this.completedNodes;
    }

    /**
     * Gets the current node progress
     * @returns The current node progress
     */
    getCurrentNodeProgress(): number {
        return this.currentNodeProgress;
    }

    /**
     * Gets the current node max value
     * @returns The current node max value
     */
    getCurrentNodeMax(): number {
        return this.currentNodeMax;
    }
} 