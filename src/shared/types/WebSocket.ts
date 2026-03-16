export interface ProgressMessage {
    value: number;
    max: number;
    prompt_id?: string;
    node?: string;
}

export interface WorkflowStructureMessage {
    totalNodes: number;
    workflow: any; // The complete workflow structure for dependency analysis
    promptId?: string;
}

export interface PreviewMessage {
    mimetype: string;
    image: string;
}

export interface NodeExecutingMessage {
    node: string;
    display_node: string;
    prompt_id: string;
}

export interface NodeExecutedMessage {
    node: string;
    display_node: string;
    output: {
        images: Array<{
            filename: string;
            subfolder: string;
            type: string;
        }>;
    };
    prompt_id: string;
}

export interface ExecutionSuccessMessage {
    prompt_id: string;
    timestamp: number;
}

export interface ExecutionInterruptedMessage {
    prompt_id: string;
    node_id: string;
    node_type: string;
    executed: any[];
    timestamp: number;
}

export interface ExecutionErrorMessage {
    prompt_id: string;
    node_id: string;
    node_type: string;
    executed: any[];
    exception_message: string;
    exception_type: string;
    traceback: string[];
}

export type FinishGenerationMessage = Record<string, string[]>;
