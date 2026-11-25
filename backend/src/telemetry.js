const { NodeSDK } = require('@opentelemetry/sdk-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');

const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const serviceName = process.env.OTEL_SERVICE_NAME || 'devops-backend';

if (otlpEndpoint && process.env.NODE_ENV !== 'test') {
  const sdk = new NodeSDK({
    serviceName,
    traceExporter: new OTLPTraceExporter({
      url: `${otlpEndpoint}/v1/traces`,
    }),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: `${otlpEndpoint}/v1/metrics`,
        }),
        exportIntervalMillis: 5000,
      }),
    ],
    instrumentations: [
      new HttpInstrumentation(),
      new ExpressInstrumentation(),
    ],
  });

  sdk.start();
  console.log(`OpenTelemetry activo -> enviando OTLP a ${otlpEndpoint}`);

  process.on('SIGTERM', () => {
    sdk
      .shutdown()
      .catch((err) => console.error('Error cerrando OpenTelemetry:', err))
      .finally(() => process.exit(0));
  });
}

const SEVERITY_MAP = {
  info: { number: 9, text: 'INFO' },
  warn: { number: 13, text: 'WARN' },
  error: { number: 17, text: 'ERROR' },
};

function toOtlpAttributes(obj) {
  return Object.entries(obj)
    .filter(([, val]) => val !== undefined && val !== null)
    .map(([key, val]) => {
      if (typeof val === 'number') {
        return Number.isInteger(val)
          ? { key, value: { intValue: String(val) } }
          : { key, value: { doubleValue: val } };
      }
      if (typeof val === 'boolean') {
        return { key, value: { boolValue: val } };
      }
      return { key, value: { stringValue: String(val) } };
    });
}

function sendOtelLog({ level = 'info', body, attributes = {}, traceId, spanId }) {
  if (!otlpEndpoint || process.env.NODE_ENV === 'test') return;

  const sev = SEVERITY_MAP[level] || SEVERITY_MAP.info;
  const timeUnixNano = (BigInt(Date.now()) * 1000000n).toString();

  const logRecord = {
    timeUnixNano,
    observedTimeUnixNano: timeUnixNano,
    severityNumber: sev.number,
    severityText: sev.text,
    body: { stringValue: body },
    attributes: toOtlpAttributes(attributes),
  };

  if (traceId && !/^0+$/.test(traceId)) logRecord.traceId = traceId;
  if (spanId && !/^0+$/.test(spanId)) logRecord.spanId = spanId;

  const payload = {
    resourceLogs: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: serviceName } },
          ],
        },
        scopeLogs: [
          {
            scope: { name: serviceName },
            logRecords: [logRecord],
          },
        ],
      },
    ],
  };

  fetch(`${otlpEndpoint}/v1/logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch((err) => {
    console.error('Error enviando log OTLP:', err.message);
  });
}

module.exports = { sendOtelLog };