import logger from "server/utils/logger";
import handleComfyWsError from "./onError";
import WebSocket from 'ws';
import getQueue from "../../getQueue";
import sendCachedImages from "../sendCachedImages";
import { QueueItem } from "@shared/types/History";

async function handleOpenComfyWsConnection(clientWs: WebSocket, promptId: string) {
    try {
        logger.logOptional('queue_image', `Queued image: ${promptId}`);

        const queueJson = await getQueue();

        if (queueJson['queue_running'][0] === undefined) {
            // If there is no running queue after we have queued an image that most likely
            // means that we have ran the workflow before and ComfyUI is reusing the output image.

            sendCachedImages(clientWs, promptId);
        } else {
            // Otherwise, we have queued generating the image.

            const runningItem = queueJson['queue_running'][0] as QueueItem;
            const outputNodeIds = runningItem[4] || [];
            const workflowStructure = runningItem[2] || {};
            
            // Enhanced workflow structure analysis for optimized progress tracking
            const nodeCount = Object.keys(workflowStructure).length;
            const nodeTypes = new Map<string, number>();
            let hasDependencies = false;
            
            // Analyze workflow structure to provide additional metadata
            for (const [nodeId, nodeData] of Object.entries(workflowStructure)) {
                const nodeInfo = nodeData as any;
                const nodeType = nodeInfo.class_type || 'unknown';
                nodeTypes.set(nodeType, (nodeTypes.get(nodeType) || 0) + 1);
                
                // Check for dependencies (node inputs that reference other nodes)
                if (nodeInfo.inputs) {
                    for (const inputValue of Object.values(nodeInfo.inputs)) {
                        if (Array.isArray(inputValue) && inputValue.length >= 2 && 
                            typeof inputValue[0] === 'string' && workflowStructure[inputValue[0]]) {
                            hasDependencies = true;
                        }
                    }
                }
            }
            
            // Send enhanced workflow structure for optimized progress tracking
            clientWs.send(JSON.stringify({ 
                type: 'workflow_structure', 
                data: {
                    totalNodes: nodeCount,
                    outputNodeCount: outputNodeIds.length,
                    hasDependencies: hasDependencies,
                    nodeTypes: Object.fromEntries(nodeTypes),
                    promptId: promptId
                }
            }));
            
            clientWs.send(JSON.stringify({ type: 'total_images', data: outputNodeIds.length }));
        }
    } catch (error) {
        handleComfyWsError(clientWs, error);
    }
}

export default handleOpenComfyWsConnection;