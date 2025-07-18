import WebSocket from 'ws';
import { IncomingMessage } from 'http';
import { Socket } from 'net';
import { generateImage } from '../utils/comfyAPIUtils';
import logger from '../utils/logger';

const wss = new WebSocket.Server({ noServer: true });

wss.on('connection', (ws) => {
    ws.on('message', async (message) => {
        const data = JSON.parse(message.toString());
        
        // Handle both old format (just workflow) and new format (workflow + name)
        let workflow;
        let workflowName;
        
        if (data.workflow && data.workflowName) {
            // New format: separate workflow and name
            workflow = data.workflow;
            workflowName = data.workflowName;
        } else {
            // Old format: just workflow (for backward compatibility)
            workflow = data;
            workflowName = 'Unknown Workflow';
        }
        
        await generateImage(workflow, ws, workflowName);
    });
});

const handleUpgrade = (request: IncomingMessage, socket: Socket, head: Buffer) => {
    if (!request.url) {
        logger.warn('No url property in WebSocket request.');
        socket.destroy();
        return;
    }
    
    const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

    if (pathname === '/ws') {
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    } else {
        socket.destroy();
    }
};

export {
    wss,
    handleUpgrade,
};
