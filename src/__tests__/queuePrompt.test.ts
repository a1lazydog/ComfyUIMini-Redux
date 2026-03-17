import queuePrompt from '../server/utils/comfyAPIUtils/generateImage/queuePrompt';

jest.mock('../server/utils/comfyAPIUtils/comfyUIAxios', () => ({
    comfyUIAxios: {
        post: jest.fn().mockResolvedValue({ data: { prompt_id: 'test-prompt-id' } }),
    },
    clientId: 'test-client-id',
}));

import { comfyUIAxios } from '../server/utils/comfyAPIUtils/comfyUIAxios';

const mockPost = comfyUIAxios.post as jest.Mock;

describe('queuePrompt', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockPost.mockResolvedValue({ data: { prompt_id: 'test-prompt-id' } });
    });

    const workflow = {
        '1': { inputs: { text: 'a dog' }, class_type: 'CLIPTextEncode' },
        '2': { inputs: { seed: 42 }, class_type: 'KSampler' },
    };

    describe('successful request', () => {
        it('should post workflow with correct structure including client_id and extra_pnginfo', async () => {
            const result = await queuePrompt(workflow as any);

            expect(mockPost).toHaveBeenCalledWith(
                '/prompt',
                {
                    prompt: workflow,
                    client_id: 'test-client-id',
                    extra_data: {
                        extra_pnginfo: {
                            workflow,
                        },
                    },
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
            );

            expect(result.prompt_id).toBe('test-prompt-id');
        });

        it('should return the full response data from the API', async () => {
            mockPost.mockResolvedValue({
                data: {
                    prompt_id: 'abc123',
                    status: 'queued',
                    number: 5,
                },
            });

            const result = await queuePrompt(workflow as any);

            expect(result).toEqual({
                prompt_id: 'abc123',
                status: 'queued',
                number: 5,
            });
        });
    });

    describe('error handling', () => {
        it('should propagate network errors', async () => {
            const networkError = new Error('Network timeout');
            mockPost.mockRejectedValue(networkError);

            await expect(queuePrompt(workflow as any)).rejects.toThrow('Network timeout');
        });

        it('should propagate API errors', async () => {
            const apiError = new Error('Bad request: workflow validation failed');
            mockPost.mockRejectedValue(apiError);

            await expect(queuePrompt(workflow as any)).rejects.toThrow(
                'Bad request: workflow validation failed'
            );
        });
    });

    describe('edge cases', () => {
        it('should handle empty workflow', async () => {
            await queuePrompt({} as any);

            expect(mockPost).toHaveBeenCalledWith(
                '/prompt',
                expect.objectContaining({
                    prompt: {},
                    extra_data: {
                        extra_pnginfo: {
                            workflow: {},
                        },
                    },
                }),
                expect.any(Object)
            );
        });

        it('should handle complex nested workflow structure', async () => {
            const complexWorkflow = {
                '1': {
                    inputs: {
                        text: 'a complex prompt',
                        clip: ['2', 0],
                    },
                    class_type: 'CLIPTextEncode',
                },
                '2': {
                    inputs: {
                        seed: 12345,
                        steps: 30,
                        cfg: 7.5,
                        sampler_name: 'euler',
                        scheduler: 'karras',
                    },
                    class_type: 'KSampler',
                },
            };

            await queuePrompt(complexWorkflow as any);

            expect(mockPost).toHaveBeenCalledWith(
                '/prompt',
                expect.objectContaining({
                    prompt: complexWorkflow,
                }),
                expect.any(Object)
            );
        });
    });
});
