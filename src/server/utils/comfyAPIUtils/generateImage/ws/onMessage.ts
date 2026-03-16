import logger from "server/utils/logger";
import WebSocket from "ws";
import getQueue from "../../getQueue";
import getOutputImages from "../getOutputImages";
import { QueueItem } from "@shared/types/History";
import {
    ProgressMessage,
    NodeExecutingMessage,
    NodeExecutedMessage,
    ExecutionSuccessMessage,
    ExecutionInterruptedMessage,
    ExecutionErrorMessage,
    FinishGenerationMessage,
    PreviewMessage,
    WorkflowStructureMessage
} from "@shared/types/WebSocket";

// Type definitions for ComfyUI WebSocket messages
interface ComfyUIMessage {
    type: string;
    data: unknown;
}

interface StatusMessage extends ComfyUIMessage {
    type: 'status';
    data: {
        status: {
            exec_info: {
                queue_remaining: number;
            };
        };
    };
}

interface ProgressComfyMessage extends ComfyUIMessage {
    type: 'progress';
    data: ProgressMessage;
}

interface ExecutingMessage extends ComfyUIMessage {
    type: 'executing';
    data: NodeExecutingMessage;
}

interface ExecutedMessage extends ComfyUIMessage {
    type: 'executed';
    data: NodeExecutedMessage;
}

interface ExecutionSuccessComfyMessage extends ComfyUIMessage {
    type: 'execution_success';
    data: ExecutionSuccessMessage;
}

interface ExecutionInterruptedComfyMessage extends ComfyUIMessage {
    type: 'execution_interrupted';
    data: ExecutionInterruptedMessage;
}

interface ExecutionErrorComfyMessage extends ComfyUIMessage {
    type: 'execution_error';
    data: ExecutionErrorMessage;
}

type ComfyUIMessageTypes =
    | StatusMessage
    | ProgressComfyMessage
    | ExecutingMessage
    | ExecutedMessage
    | ExecutionSuccessComfyMessage
    | ExecutionInterruptedComfyMessage
    | ExecutionErrorComfyMessage;

// Type for the preview image payload
interface PreviewImagePayload {
    type: 'preview';
    data: PreviewMessage;
}

// Type for workflow structure message
interface WorkflowStructurePayload {
    type: 'workflow_structure';
    data: WorkflowStructureMessage;
}

// Type for node executing message
interface NodeExecutingPayload {
    type: 'node_executing';
    data: NodeExecutingMessage;
}

// Type for node executed message
interface NodeExecutedPayload {
    type: 'node_executed';
    data: NodeExecutedMessage;
}

// Type for completion message
interface CompletionPayload {
    type: 'completed';
    data: FinishGenerationMessage;
}

// Type for queue response
interface QueueResponse {
    queue_running: QueueItem[];
    queue_pending: QueueItem[];
    queue_completed: QueueItem[];
}

/**
 * Handles recieving messages from ComfyUI WebSocket.
 * @param clientWs The WebSocket connection to the frontend client.
 * @param comfyWs The WebSocket connection to the ComfyUI instance.
 * @param data The data recieved from the ComfyUI WebSocket.
 * @param isBinary Whether the data is binary or not, i.e. if it is an image.
 */
async function handleComfyWsMessage(clientWs: WebSocket, comfyWs: WebSocket, data: WebSocket.Data, isBinary: boolean): Promise<void> {
    if (!Buffer.isBuffer(data)) {
        logger.warn('Recieved non-buffer data from ComfyUI websocket:', data);
        return;
    }

    if (isBinary) {
        try {
            handleSendImageBuffer(clientWs, data);
        } catch (error) {
            logger.warn('Failed to handle sending image buffer:', error);
        }
    } else {
        try {
            await handleSendMessage(clientWs, comfyWs, data);
        } catch (error) {
            logger.warn('Failed to handle sending message:', error);
        }
    }
}

function handleSendImageBuffer(clientWs: WebSocket, buffer: Buffer): void {
    // Handle image buffers like ComfyUI client
    const imageType = buffer.readUInt32BE(0);
    let imageMime: string;

    switch (imageType) {
        case 1:
            imageMime = 'image/jpeg';
            break;
        case 2:
            imageMime = 'image/png';
            break;
        default:
            imageMime = 'image/jpeg';
    }

    const imageBlob = buffer.slice(8);
    const base64Image = imageBlob.toString('base64');

    const jsonPayload: PreviewImagePayload = {
        type: 'preview',
        data: { image: base64Image, mimetype: imageMime },
    };

    clientWs.send(JSON.stringify(jsonPayload));
}

async function handleSendMessage(clientWs: WebSocket, comfyWs: WebSocket, data: Buffer): Promise<void> {
    const messageString = data.toString();
    const message: ComfyUIMessageTypes = JSON.parse(messageString);

    switch (message.type) {
        case 'status':
            await handleStatusMessage(clientWs, comfyWs, message as StatusMessage);
            break;
        case 'progress':
            handleProgressMessage(clientWs, message as ProgressComfyMessage);
            break;
        case 'executing':
            handleExecutingMessage(clientWs, message as ExecutingMessage);
            break;
        case 'executed':
            handleExecutedMessage(clientWs, message as ExecutedMessage);
            break;
        case 'execution_success':
            await handleExecutionSuccessMessage(clientWs, message as ExecutionSuccessComfyMessage);
            break;
        case 'execution_interrupted':
            await handleExecutionInterruptedMessage(clientWs, message as ExecutionInterruptedComfyMessage);
            break;
        case 'execution_error':
            handleExecutionErrorMessage(clientWs, message as ExecutionErrorComfyMessage);
            break;
    }
}

async function handleStatusMessage(clientWs: WebSocket, comfyWs: WebSocket, message: StatusMessage): Promise<void> {
    // Nothing else in the queue, just close the connection
    if (message.data.status.exec_info.queue_remaining == 0) {
        comfyWs.close();
        return;
    }
    
    const queueJson: QueueResponse = await getQueue();

    // Check if prompt is currently running
    if (queueJson['queue_running'].length > 0) {
        const runningItem = queueJson['queue_running'][0] as QueueItem;
        const runningPromptId = runningItem[1];
        
        // Send workflow structure for progress tracking
        const workflowStructure = runningItem[2] || {};
        const workflowPayload: WorkflowStructurePayload = {
            type: 'workflow_structure', 
            data: {
                totalNodes: Object.keys(workflowStructure).length,
                workflow: workflowStructure,
                promptId: runningPromptId
            }
        };
        clientWs.send(JSON.stringify(workflowPayload));
    }
}

function handleProgressMessage(clientWs: WebSocket, message: ProgressComfyMessage): void {
    clientWs.send(JSON.stringify(message));
}

function handleExecutingMessage(clientWs: WebSocket, message: ExecutingMessage): void {
    const nodeExecutingPayload: NodeExecutingPayload = {
        type: 'node_executing',
        data: message.data
    };
    clientWs.send(JSON.stringify(nodeExecutingPayload));
}

function handleExecutedMessage(clientWs: WebSocket, message: ExecutedMessage): void {
    const nodeExecutedPayload: NodeExecutedPayload = {
        type: 'node_executed',
        data: message.data
    };
    clientWs.send(JSON.stringify(nodeExecutedPayload));
}

async function handleExecutionSuccessMessage(clientWs: WebSocket, message: ExecutionSuccessComfyMessage): Promise<void> {
    logger.logOptional('generation_finish', 'Image generation finished.');
    await sendCompletionMessage(clientWs, message.data.prompt_id);
}

async function handleExecutionInterruptedMessage(clientWs: WebSocket, message: ExecutionInterruptedComfyMessage): Promise<void> {
    logger.logOptional('generation_finish', 'Image generation interrupted.');
    await sendCompletionMessage(clientWs, message.data.prompt_id);
}

function handleExecutionErrorMessage(clientWs: WebSocket, message: ExecutionErrorComfyMessage): void {
    const { node_type, exception_type, exception_message } = message.data;
    logger.warn(`Execution error in node "${node_type}": [${exception_type}] ${exception_message}`);
    clientWs.send(JSON.stringify({
        type: 'error',
        message: `Node "${node_type}" failed: ${exception_message}`,
    }));
}

async function sendCompletionMessage(clientWs: WebSocket, promptId: string): Promise<void> {
    // Get output images and send completion message
    try {
        const outputImages = await getOutputImages(promptId);

        // Check if we got any images back
        const totalImages = Object.values(outputImages).flat().length;
        
        if (totalImages === 0) {
            logger.logOptional('generation_finish', 'No output images found for prompt ID: ' + promptId);
            return;
        }

        const completionPayload: CompletionPayload = { 
            type: 'completed', 
            data: outputImages 
        };
        clientWs.send(JSON.stringify(completionPayload));
    } catch (error) {
        logger.warn('Error retrieving output images: ' + error);
    }
}

export default handleComfyWsMessage;