import WebSocket from 'ws';
import config from 'config';
import { Workflow } from '@shared/types/Workflow';
import logger from 'server/utils/logger';
import { clientId, httpsAgent } from '../comfyUIAxios';
import queuePrompt from './queuePrompt';
import handleComfyWsMessage from './ws/onMessage';
import handleComfyWsClose from './ws/onClose';
import handleComfyWsError from './ws/onError';
import handleOpenComfyWsConnection from './ws/onOpen';
import { storeWorkflowName } from '../getQueue';

function initialiseComfyWs() {
    const comfyWsUrl: string = config.get('comfyui_ws_url');
    const comfyWsOptions: WebSocket.ClientOptions = {};

    if (comfyWsUrl.startsWith('wss://')) {
        if (config.get('reject_unauthorised_cert')) {
            logger.warn(
                'Reject unauthorised certificates is enabled, this may cause issues when attempting to connect to a wss:// ComfyUI websocket.'
            );
        }

        comfyWsOptions.agent = httpsAgent;
    }

    return new WebSocket(`${comfyWsUrl}/ws?clientId=${clientId}`, comfyWsOptions);
}

async function generateImage(workflowPrompt: Workflow, clientWs: WebSocket, workflowName?: string) {
    const comfyWsConnection = initialiseComfyWs();

    comfyWsConnection.on('open', async () => {
        try {
            const promptData = await queuePrompt(workflowPrompt);
            const promptId = promptData.prompt_id;

            // Store the workflow name if provided
            if (workflowName) {
                storeWorkflowName(promptId, workflowName);
            }

            await handleOpenComfyWsConnection(clientWs);

            comfyWsConnection.on('message', (data, isBinary) => handleComfyWsMessage(clientWs, comfyWsConnection, data, isBinary));
            comfyWsConnection.on('close', async () => await handleComfyWsClose(clientWs));
            comfyWsConnection.on('error', (error) => handleComfyWsError(comfyWsConnection, error));
        } catch (error) {
            logger.warn('Error queueing prompt:', error);
            
            // Send error message to client
            try {
                clientWs.send(JSON.stringify({ 
                    type: 'error', 
                    message: 'Failed to queue prompt. Please check your workflow configuration.',
                    details: error instanceof Error ? error.message : 'Unknown error'
                }));
            } catch (wsError) {
                logger.warn('Failed to send error message to client:', wsError);
            }
            
            // Close the ComfyUI WebSocket connection
            try {
                comfyWsConnection.close();
            } catch (closeError) {
                logger.warn('Failed to close ComfyUI WebSocket connection:', closeError);
            }
        }
    });
}

export default generateImage;
