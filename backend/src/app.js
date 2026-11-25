const express = require('express');
const cors = require('cors');
const { metrics, trace } = require('@opentelemetry/api');
const { sendOtelLog } = require('./telemetry');
const authRoutes = require('./routes/auth.routes');
const usersRoutes = require('./routes/users.routes');
const productsRoutes = require('./routes/products.routes');

const app = express();

const meter = metrics.getMeter('devops-backend');

const httpRequestsCounter = meter.createCounter('app_http_requests_total', {
  description: 'Total de peticiones HTTP recibidas por endpoint',
});

const httpErrorsCounter = meter.createCounter('app_http_errors_total', {
  description: 'Total de respuestas HTTP con error (4xx y 5xx) por endpoint',
});

const httpDurationHistogram = meter.createHistogram('app_http_response_time_ms', {
  description: 'Latencia (RT) de peticiones HTTP en milisegundos',
  unit: 'ms',
});

app.use(cors());
app.use(express.json());

// Middleware de observabilidad: Logs + Métricas OTLP por endpoint
app.use((req, res, next) => {
  const start = Date.now();
  const spanContext = trace.getActiveSpan()?.spanContext();

  res.on('finish', () => {
    if (process.env.NODE_ENV === 'test') return;

    const responseTimeMs = Date.now() - start;
    const timestamp = new Date().toISOString();
    const routePattern = req.route ? `${req.baseUrl}${req.route.path}` : req.originalUrl;
    const statusCode = res.statusCode;
    const isError = statusCode >= 400;

    const metricAttrs = {
      method: req.method,
      endpoint: routePattern,
      statusCode: String(statusCode),
    };

    httpRequestsCounter.add(1, metricAttrs);
    httpDurationHistogram.record(responseTimeMs, metricAttrs);
    if (isError) {
      httpErrorsCounter.add(1, metricAttrs);
    }

    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    const logEntry = {
      timestamp,
      level,
      method: req.method,
      endpoint: req.originalUrl,
      route: routePattern,
      statusCode,
      responseTimeMs,
    };

    sendOtelLog({
      level,
      body: `${req.method} ${req.originalUrl} -> ${statusCode} (${responseTimeMs}ms)`,
      attributes: logEntry,
      traceId: spanContext?.traceId,
      spanId: spanContext?.spanId,
    });

    console.log(JSON.stringify(logEntry));
  });
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'devops-backend', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/products', productsRoutes);

app.use((err, req, res, _next) => {
  const spanContext = trace.getActiveSpan()?.spanContext();
  const errorEntry = {
    timestamp: new Date().toISOString(),
    level: 'error',
    method: req.method,
    endpoint: req.originalUrl,
    statusCode: 500,
    errorMessage: err.message,
  };

  sendOtelLog({
    level: 'error',
    body: `Excepción no controlada en ${req.method} ${req.originalUrl}: ${err.message}`,
    attributes: errorEntry,
    traceId: spanContext?.traceId,
    spanId: spanContext?.spanId,
  });

  console.error(JSON.stringify(errorEntry));
  res.status(500).json({ error: 'Error interno del servidor' });
});

module.exports = app;