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
            const workflowEntries = Object.entries(workflowStructure);
            const nodeCount = workflowEntries.length;
            const nodeTypes: Record<string, number> = {};
            
            // Pre-compute node IDs for O(1) dependency lookup
            const nodeIds = new Set(Object.keys(workflowStructure));
            let hasDependencies = false;
            
            // Optimized workflow analysis with early exit for dependencies
            for (const [, nodeData] of workflowEntries) {
                const nodeInfo = nodeData as any;
                const nodeType = nodeInfo.class_type || 'unknown';
                
                // Count node types efficiently
                nodeTypes[nodeType] = (nodeTypes[nodeType] || 0) + 1;
                
                // Fast dependency detection with early exit
                if (!hasDependencies && nodeInfo.inputs) {
                    for (const inputValue of Object.values(nodeInfo.inputs)) {
                        if (Array.isArray(inputValue) && inputValue.length >= 2 && 
                            typeof inputValue[0] === 'string' && nodeIds.has(inputValue[0])) {
                            hasDependencies = true;
                            break; // Early exit once dependency found
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
                    nodeTypes: nodeTypes,
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