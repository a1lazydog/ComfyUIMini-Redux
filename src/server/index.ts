import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import config from 'config';
import compression from 'compression';
import helmet from 'helmet';

// Makes sure that if there isn't a config file created, it is created before anything else
import { initialiseConfig } from './utils/configInitialiser';
initialiseConfig();

import paths from './utils/paths';
import logger from './utils/logger';
import { handleUpgrade } from './routes/wsRouter';
import mainRouter from './routes/mainRouter';
import comfyUIRouter from './routes/comfyUIRouter';
import settingsRouter from './routes/settingsRouter';
import { comfyUICheck } from './utils/comfyAPIUtils';
import { serverWorkflowsCheck } from './utils/workflowUtils';
import getLocalIp from './utils/localIp';
import renderRouter from './routes/renderRouter';

const app = express();
const server = http.createServer(app);

// Security and performance middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'"],
      mediaSrc: ["'self'", "blob:"],
    },
  },
}));

// Enable gzip compression
app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6,
  threshold: 1024,
}));

app.set('view engine', 'ejs');
app.set('views', paths.views);

// Performance optimization middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  // Set cache headers for static assets
  if (req.url.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
    res.set({
      'Cache-Control': 'public, max-age=31536000, immutable', // 1 year
      'Expires': new Date(Date.now() + 31536000000).toUTCString(),
    });
  }
  
  // Set no-cache for HTML files
  if (req.url.match(/\.(html|htm)$/)) {
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    });
  }
  
  next();
});

app.use('/', mainRouter);
app.use('/comfyui', comfyUIRouter);
app.use('/setsetting', settingsRouter);
app.use('/render', renderRouter);
app.use('/shared', express.static(paths.shared, {
  maxAge: '1y',
  immutable: true,
}));
app.use(express.static(paths.public, {
  maxAge: '1y',
  immutable: true,
}));
app.use(express.static(paths.clientJs, {
  maxAge: '1y',
  immutable: true,
}));

comfyUICheck();
serverWorkflowsCheck();

server.on('upgrade', handleUpgrade);

server.listen(config.get('app_port'), '0.0.0.0', () => {
    logger.success(`Running on http://${getLocalIp()}:${config.get('app_port')}`);
});
