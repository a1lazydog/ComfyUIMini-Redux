import handleComfyWsMessage from '../server/utils/comfyAPIUtils/generateImage/ws/onMessage';
import WebSocket from 'ws';
import getQueue from '../server/utils/comfyAPIUtils/getQueue';
import getOutputImages from '../server/utils/comfyAPIUtils/generateImage/getOutputImages';
import logger from '../server/utils/logger';
import { QueueItem } from '@shared/types/History';

// Mock dependencies
jest.mock('../server/utils/comfyAPIUtils/getQueue');
jest.mock('../server/utils/comfyAPIUtils/generateImage/getOutputImages');
jest.mock('../server/utils/logger');

const mockGetQueue = getQueue as jest.MockedFunction<typeof getQueue>;
const mockGetOutputImages = getOutputImages as jest.MockedFunction<typeof getOutputImages>;
const mockLogger = logger as jest.Mocked<typeof logger>;

describe('handleComfyWsMessage', () => {
    let mockClientWs: jest.Mocked<WebSocket>;
    let mockComfyWs: jest.Mocked<WebSocket>;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Create mock WebSocket instances
        mockClientWs = {
            send: jest.fn(),
            close: jest.fn(),
        } as any;

        mockComfyWs = {
            send: jest.fn(),
            close: jest.fn(),
        } as any;

        // Setup default mock implementations
        mockGetQueue.mockResolvedValue({
            queue_running: [],
            queue_pending: [],
            queue_completed: []
        });

        mockGetOutputImages.mockResolvedValue({
            'node1': ['/comfyui/image?filename=test1.png&subfolder=output&type=output'],
            'node2': ['/comfyui/image?filename=test2.png&subfolder=output&type=output']
        });

        // Mock logger methods
        mockLogger.warn = jest.fn();
        mockLogger.logOptional = jest.fn();
    });

    describe('Binary data handling', () => {
        it('should handle JPEG image buffer correctly', () => {
            // Create a mock JPEG buffer (type 1)
            const imageBuffer = Buffer.alloc(12);
            imageBuffer.writeUInt32BE(1, 0); // JPEG type
            imageBuffer.write('test', 8); // Mock image data

            handleComfyWsMessage(mockClientWs, mockComfyWs, imageBuffer, true);

            expect(mockClientWs.send).toHaveBeenCalledWith(
                JSON.stringify({
                    type: 'preview',
                    data: {
                        image: 'dGVzdA==', // base64 of 'test'
                        mimetype: 'image/jpeg'
                    }
                })
            );
        });

        it('should handle PNG image buffer correctly', () => {
            // Create a mock PNG buffer (type 2)
            const imageBuffer = Buffer.alloc(12);
            imageBuffer.writeUInt32BE(2, 0); // PNG type
            imageBuffer.write('test', 8); // Mock image data

            handleComfyWsMessage(mockClientWs, mockComfyWs, imageBuffer, true);

            expect(mockClientWs.send).toHaveBeenCalledWith(
                JSON.stringify({
                    type: 'preview',
                    data: {
                        image: 'dGVzdA==', // base64 of 'test'
                        mimetype: 'image/png'
                    }
                })
            );
        });

        it('should default to JPEG for unknown image types', () => {
            // Create a mock buffer with unknown type
            const imageBuffer = Buffer.alloc(12);
            imageBuffer.writeUInt32BE(99, 0); // Unknown type
            imageBuffer.write('test', 8); // Mock image data

            handleComfyWsMessage(mockClientWs, mockComfyWs, imageBuffer, true);

            expect(mockClientWs.send).toHaveBeenCalledWith(
                JSON.stringify({
                    type: 'preview',
                    data: {
                        image: 'dGVzdA==', // base64 of 'test'
                        mimetype: 'image/jpeg'
                    }
                })
            );
        });

        it('should handle non-buffer data gracefully', () => {
            const nonBufferData = 'not a buffer';

            handleComfyWsMessage(mockClientWs, mockComfyWs, nonBufferData as any, false);

            expect(mockLogger.warn).toHaveBeenCalledWith(
                'Recieved non-buffer data from ComfyUI websocket:',
                nonBufferData
            );
            expect(mockClientWs.send).not.toHaveBeenCalled();
        });
    });

    describe('Status message handling', () => {
        it('should close connection when queue is empty', async () => {
            const statusMessage = {
                type: 'status',
                data: {
                    status: {
                        exec_info: {
                            queue_remaining: 0
                        }
                    }
                }
            };

            const messageBuffer = Buffer.from(JSON.stringify(statusMessage));

            await handleComfyWsMessage(mockClientWs, mockComfyWs, messageBuffer, false);

            expect(mockComfyWs.close).toHaveBeenCalled();
            expect(mockGetQueue).not.toHaveBeenCalled();
        });

        it('should send workflow structure when queue has running items', async () => {
            const statusMessage = {
                type: 'status',
                data: {
                    status: {
                        exec_info: {
                            queue_remaining: 1
                        }
                    }
                }
            };

            const mockQueueItem: QueueItem = [
                1, 
                'test-prompt-id', 
                { 
                    node1: { inputs: {}, class_type: 'test' },
                    node2: { inputs: {}, class_type: 'test' }
                }, 
                { client_id: 'test' }, 
                ['node1', 'node2']
            ];
            
            const mockQueueResponse = {
                queue_running: [mockQueueItem],
                queue_pending: [],
                queue_completed: []
            };

            mockGetQueue.mockResolvedValue(mockQueueResponse);

            const messageBuffer = Buffer.from(JSON.stringify(statusMessage));

            await handleComfyWsMessage(mockClientWs, mockComfyWs, messageBuffer, false);

            expect(mockGetQueue).toHaveBeenCalled();
            expect(mockClientWs.send).toHaveBeenCalledWith(
                JSON.stringify({
                    type: 'workflow_structure',
                    data: {
                        totalNodes: 2,
                        workflow: { 
                            node1: { inputs: {}, class_type: 'test' },
                            node2: { inputs: {}, class_type: 'test' }
                        },
                        promptId: 'test-prompt-id'
                    }
                })
            );
        });

        it('should handle empty running queue gracefully', async () => {
            const statusMessage = {
                type: 'status',
                data: {
                    status: {
                        exec_info: {
                            queue_remaining: 1
                        }
                    }
                }
            };

            const mockQueueResponse = {
                queue_running: [],
                queue_pending: [],
                queue_completed: []
            };

            mockGetQueue.mockResolvedValue(mockQueueResponse);

            const messageBuffer = Buffer.from(JSON.stringify(statusMessage));

            await handleComfyWsMessage(mockClientWs, mockComfyWs, messageBuffer, false);

            expect(mockGetQueue).toHaveBeenCalled();
            expect(mockClientWs.send).not.toHaveBeenCalled();
        });
    });

    describe('Progress message handling', () => {
        it('should forward progress messages directly', () => {
            const progressMessage = {
                type: 'progress',
                data: {
                    value: 50,
                    max: 100,
                    prompt_id: 'test-prompt',
                    node: 'test-node'
                }
            };

            const messageBuffer = Buffer.from(JSON.stringify(progressMessage));

            handleComfyWsMessage(mockClientWs, mockComfyWs, messageBuffer, false);

            expect(mockClientWs.send).toHaveBeenCalledWith(
                JSON.stringify(progressMessage)
            );
        });
    });

    describe('Executing message handling', () => {
        it('should transform executing messages correctly', () => {
            const executingMessage = {
                type: 'executing',
                data: {
                    node: 'test-node',
                    display_node: 'Test Node',
                    prompt_id: 'test-prompt'
                }
            };

            const messageBuffer = Buffer.from(JSON.stringify(executingMessage));

            handleComfyWsMessage(mockClientWs, mockComfyWs, messageBuffer, false);

            expect(mockClientWs.send).toHaveBeenCalledWith(
                JSON.stringify({
                    type: 'node_executing',
                    data: {
                        node: 'test-node',
                        display_node: 'Test Node',
                        prompt_id: 'test-prompt'
                    }
                })
            );
        });
    });

    describe('Executed message handling', () => {
        it('should transform executed messages correctly', () => {
            const executedMessage = {
                type: 'executed',
                data: {
                    node: 'test-node',
                    display_node: 'Test Node',
                    output: {
                        images: [
                            {
                                filename: 'test.png',
                                subfolder: 'output',
                                type: 'output'
                            }
                        ]
                    },
                    prompt_id: 'test-prompt'
                }
            };

            const messageBuffer = Buffer.from(JSON.stringify(executedMessage));

            handleComfyWsMessage(mockClientWs, mockComfyWs, messageBuffer, false);

            expect(mockClientWs.send).toHaveBeenCalledWith(
                JSON.stringify({
                    type: 'node_executed',
                    data: {
                        node: 'test-node',
                        display_node: 'Test Node',
                        output: {
                            images: [
                                {
                                    filename: 'test.png',
                                    subfolder: 'output',
                                    type: 'output'
                                }
                            ]
                        },
                        prompt_id: 'test-prompt'
                    }
                })
            );
        });
    });

    describe('Execution success message handling', () => {
        it('should send completion message with output images', async () => {
            const successMessage = {
                type: 'execution_success',
                data: {
                    prompt_id: 'test-prompt',
                    timestamp: 1234567890
                }
            };

            const mockOutputImages = {
                'node1': ['/comfyui/image?filename=test1.png&subfolder=output&type=output'],
                'node2': ['/comfyui/image?filename=test2.png&subfolder=output&type=output']
            };

            mockGetOutputImages.mockResolvedValue(mockOutputImages);

            const messageBuffer = Buffer.from(JSON.stringify(successMessage));

            await handleComfyWsMessage(mockClientWs, mockComfyWs, messageBuffer, false);

            expect(mockGetOutputImages).toHaveBeenCalledWith('test-prompt');
            expect(mockLogger.logOptional).toHaveBeenCalledWith('generation_finish', 'Image generation finished.');
            expect(mockClientWs.send).toHaveBeenCalledWith(
                JSON.stringify({
                    type: 'completed',
                    data: mockOutputImages
                })
            );
        });

        it('should handle case with no output images', async () => {
            const successMessage = {
                type: 'execution_success',
                data: {
                    prompt_id: 'test-prompt',
                    timestamp: 1234567890
                }
            };

            mockGetOutputImages.mockResolvedValue({});

            const messageBuffer = Buffer.from(JSON.stringify(successMessage));

            await handleComfyWsMessage(mockClientWs, mockComfyWs, messageBuffer, false);

            expect(mockGetOutputImages).toHaveBeenCalledWith('test-prompt');
            expect(mockLogger.logOptional).toHaveBeenCalledWith(
                'generation_finish',
                'No output images found for prompt ID: test-prompt'
            );
            expect(mockClientWs.send).not.toHaveBeenCalled();
        });

        it('should handle getOutputImages errors gracefully', async () => {
            const successMessage = {
                type: 'execution_success',
                data: {
                    prompt_id: 'test-prompt',
                    timestamp: 1234567890
                }
            };

            mockGetOutputImages.mockRejectedValue(new Error('API Error'));

            const messageBuffer = Buffer.from(JSON.stringify(successMessage));

            await handleComfyWsMessage(mockClientWs, mockComfyWs, messageBuffer, false);

            expect(mockGetOutputImages).toHaveBeenCalledWith('test-prompt');
            expect(mockLogger.warn).toHaveBeenCalledWith(
                'Error retrieving output images: Error: API Error'
            );
            expect(mockClientWs.send).not.toHaveBeenCalled();
        });
    });

    describe('Execution interrupted message handling', () => {
        it('should send completion message for interrupted execution', async () => {
            const interruptedMessage = {
                type: 'execution_interrupted',
                data: {
                    prompt_id: 'test-prompt',
                    node_id: 'test-node',
                    node_type: 'test-type',
                    executed: [],
                    timestamp: 1234567890
                }
            };

            const mockOutputImages = {
                'node1': ['/comfyui/image?filename=test1.png&subfolder=output&type=output']
            };

            mockGetOutputImages.mockResolvedValue(mockOutputImages);

            const messageBuffer = Buffer.from(JSON.stringify(interruptedMessage));

            await handleComfyWsMessage(mockClientWs, mockComfyWs, messageBuffer, false);

            expect(mockGetOutputImages).toHaveBeenCalledWith('test-prompt');
            expect(mockLogger.logOptional).toHaveBeenCalledWith('generation_finish', 'Image generation interrupted.');
            expect(mockClientWs.send).toHaveBeenCalledWith(
                JSON.stringify({
                    type: 'completed',
                    data: mockOutputImages
                })
            );
        });
    });

    describe('Execution error message handling', () => {
        it('should send error message for execution errors', () => {
            const errorMessage = {
                type: 'execution_error',
                data: {
                    prompt_id: 'test-prompt',
                    node_id: 'test-node',
                    node_type: 'TestNode',
                    executed: [],
                    exception_message: 'Test error occurred',
                    exception_type: 'ValueError',
                    traceback: ['line 1', 'line 2']
                }
            };

            const messageBuffer = Buffer.from(JSON.stringify(errorMessage));

            handleComfyWsMessage(mockClientWs, mockComfyWs, messageBuffer, false);

            expect(mockLogger.warn).toHaveBeenCalledWith(
                'Execution error in node "TestNode": [ValueError] Test error occurred'
            );
            expect(mockClientWs.send).toHaveBeenCalledWith(
                JSON.stringify({
                    type: 'error',
                    message: 'Node "TestNode" failed: Test error occurred',
                })
            );
        });
    });

    describe('Error handling', () => {
        it('should handle JSON parsing errors gracefully', async () => {
            const invalidJsonBuffer = Buffer.from('invalid json');

            await handleComfyWsMessage(mockClientWs, mockComfyWs, invalidJsonBuffer, false);

            expect(mockLogger.warn).toHaveBeenCalledWith(
                'Failed to handle sending message:',
                expect.any(Error)
            );
        });

        it('should handle unknown message types gracefully', async () => {
            const unknownMessage = {
                type: 'unknown_type',
                data: {}
            };

            const messageBuffer = Buffer.from(JSON.stringify(unknownMessage));

            await handleComfyWsMessage(mockClientWs, mockComfyWs, messageBuffer, false);

            expect(mockClientWs.send).not.toHaveBeenCalled();
        });

        it('should handle binary data errors gracefully', () => {
            // Mock Buffer.isBuffer to return false for this test
            const originalIsBuffer = Buffer.isBuffer;
            Buffer.isBuffer = jest.fn().mockReturnValue(false) as any;

            const fakeBuffer = 'fake buffer';

            handleComfyWsMessage(mockClientWs, mockComfyWs, fakeBuffer as any, true);

            expect(mockLogger.warn).toHaveBeenCalledWith(
                'Recieved non-buffer data from ComfyUI websocket:',
                fakeBuffer
            );

            // Restore original function
            Buffer.isBuffer = originalIsBuffer;
        });
    });

    describe('Integration scenarios', () => {
        it('should handle a complete generation workflow', async () => {
            // Simulate a complete workflow: status -> progress -> executing -> executed -> success
            const messages = [
                {
                    type: 'status',
                    data: {
                        status: {
                            exec_info: {
                                queue_remaining: 1
                            }
                        }
                    }
                },
                {
                    type: 'progress',
                    data: {
                        value: 25,
                        max: 100,
                        prompt_id: 'test-prompt'
                    }
                },
                {
                    type: 'executing',
                    data: {
                        node: 'test-node',
                        display_node: 'Test Node',
                        prompt_id: 'test-prompt'
                    }
                },
                {
                    type: 'executed',
                    data: {
                        node: 'test-node',
                        display_node: 'Test Node',
                        output: {
                            images: [
                                {
                                    filename: 'test.png',
                                    subfolder: 'output',
                                    type: 'output'
                                }
                            ]
                        },
                        prompt_id: 'test-prompt'
                    }
                },
                {
                    type: 'execution_success',
                    data: {
                        prompt_id: 'test-prompt',
                        timestamp: 1234567890
                    }
                }
            ];

            const mockQueueItem2: QueueItem = [
                1, 
                'test-prompt', 
                { 
                    node1: { inputs: {}, class_type: 'test' }
                }, 
                { client_id: 'test' }, 
                ['node1']
            ];
            
            mockGetQueue.mockResolvedValue({
                queue_running: [mockQueueItem2],
                queue_pending: [],
                queue_completed: []
            });

            mockGetOutputImages.mockResolvedValue({
                'node1': ['/comfyui/image?filename=test.png&subfolder=output&type=output']
            });

            // Process each message
            for (const message of messages) {
                const messageBuffer = Buffer.from(JSON.stringify(message));
                await handleComfyWsMessage(mockClientWs, mockComfyWs, messageBuffer, false);
            }

            // Verify all expected calls were made
            expect(mockGetQueue).toHaveBeenCalled();
            expect(mockGetOutputImages).toHaveBeenCalledWith('test-prompt');
            expect(mockClientWs.send).toHaveBeenCalledTimes(5); // 5 messages sent
        });
    });
}); 