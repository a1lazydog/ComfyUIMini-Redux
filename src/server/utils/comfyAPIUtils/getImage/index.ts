import { comfyUIAxios } from '../comfyUIAxios';
import fs from 'fs';
import path from 'path';
import config from 'config';

function getContentType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    if (['.jpg', '.jpeg'].includes(ext)) return 'image/jpeg';
    if (['.mp4'].includes(ext)) return 'video/mp4';
    return 'image/png';
}

function tryFilesystemFallback(filename: string, subfolder: string, type: string) {
    if (type === 'temp') return null;

    const configKey = type === 'input' ? 'input_dir' : 'output_dir';

    if (!config.has(configKey)) {
        console.error(`${type === 'input' ? 'Input' : 'Output'} directory not configured in config`);
        return null;
    }

    const dirPath = config.get(configKey);

    if (!dirPath || typeof dirPath !== 'string') {
        console.error(`${type === 'input' ? 'Input' : 'Output'} directory not set properly in config`);
        return null;
    }

    const filePath = path.join(dirPath, subfolder, filename);

    if (!fs.existsSync(filePath)) {
        console.error(`File not found on filesystem: ${filePath}`);
        return null;
    }

    const readFile = fs.readFileSync(filePath);
    const contentType = getContentType(filename);

    return {
        data: readFile,
        headers: {
            'content-type': contentType,
            'content-length': String(readFile.length),
        },
    };
}

async function getImage(filename: string, subfolder: string, type: string) {
    const params = new URLSearchParams({ filename, subfolder, type });

    try {
        const response = await comfyUIAxios.get(`/view?${params.toString()}`, { responseType: 'arraybuffer' });

        return response;
    } catch (err: unknown) {
        const isConnRefused = err instanceof Error && 'code' in err && err.code === 'ECONNREFUSED';
        const is404 = err instanceof Error && 'response' in err && (err as any).response?.status === 404;

        if (isConnRefused || is404) {
            if (is404) {
                console.warn(`ComfyUI returned 404 for /view?${params.toString()} — attempting filesystem fallback`);
            }
            const fallback = tryFilesystemFallback(filename, subfolder, type);
            if (fallback) return fallback;
        }

        console.error('Unknown error when fetching image:', err);
        return null;
    }
}

export default getImage;
