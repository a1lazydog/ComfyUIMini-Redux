export type WorkflowType = 'local' | 'server';

export interface InputOption {
    node_id: string;
    input_name_in_node: string;
    title: string;
    disabled?: boolean;
    textfield_format?: 'single' | 'multiline' | 'dropdown';
    numberfield_format?: 'type' | 'slider';
    min?: number;
    max?: number;
}

export interface WorkflowMetadata {
    title: string;
    description: string;
    format_version: string;
    input_options: InputOption[];
}

export interface NodeInputs {
    [key: string]: string | number | boolean | string[] | number[];
}

export interface WorkflowNode {
    inputs: NodeInputs;
    class_type: string;
    _meta: {
        title: string;
    };
}

export interface Workflow {
    [key: string]: WorkflowNode;
}

export type WorkflowWithMetadata = Workflow & {
    _comfyuimini_meta: WorkflowMetadata;
};

export type AnyWorkflow = WorkflowWithMetadata | Workflow;

export type WorkflowFileReadError = {
    error: 'notFound' | 'invalidJson' | 'unknown';
};
