const fs = require('fs');
const path = require('path');

const OTEL_METRICS_URL =
  process.env.OTEL_METRICS_URL || 'http://otel-collector:4318/v1/metrics';
const INTERVAL_MS = Number(process.env.INTERVAL_MS || 10000);
const HOST_PROC = process.env.HOST_PROC || '/hostfs/proc';
const HOST_SYS = process.env.HOST_SYS || '/hostfs/sys';

let prevCpu = null;
let prevNet = null;
let prevNetTime = null;

function readCpuTotals() {
  const stat = fs.readFileSync(path.join(HOST_PROC, 'stat'), 'utf8');
  const firstLine = stat.split('\n')[0];
  const parts = firstLine.trim().split(/\s+/).slice(1).map(Number);
  const idle = parts[3] + (parts[4] || 0);
  const total = parts.reduce((acc, v) => acc + v, 0);
  return { idle, total };
}

function getCpuPercent() {
  const current = readCpuTotals();
  if (!prevCpu) {
    prevCpu = current;
    return 0;
  }
  const totalDiff = current.total - prevCpu.total;
  const idleDiff = current.idle - prevCpu.idle;
  prevCpu = current;
  if (totalDiff <= 0) return 0;
  return Number((((totalDiff - idleDiff) / totalDiff) * 100).toFixed(2));
}

function getMemoryMetrics() {
  const meminfo = fs.readFileSync(path.join(HOST_PROC, 'meminfo'), 'utf8');
  const values = {};
  for (const line of meminfo.split('\n')) {
    const match = line.match(/^(\w+):\s+(\d+)/);
    if (match) values[match[1]] = Number(match[2]); // kB
  }
  const totalKb = values.MemTotal || 1;
  const availableKb = values.MemAvailable ?? values.MemFree ?? 0;
  const usedKb = Math.max(0, totalKb - availableKb);
  return {
    usedPercent: Number(((usedKb / totalKb) * 100).toFixed(2)),
    usedMb: Number((usedKb / 1024).toFixed(1)),
  };
}

function getNetworkBandwidthKbps() {
  const netDev = fs.readFileSync(path.join(HOST_PROC, 'net/dev'), 'utf8');
  let rxBytes = 0;
  let txBytes = 0;

  for (const line of netDev.split('\n').slice(2)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('lo:')) continue;
    const [, stats] = trimmed.split(':');
    if (!stats) continue;
    const cols = stats.trim().split(/\s+/).map(Number);
    rxBytes += cols[0] || 0;
    txBytes += cols[8] || 0;
  }

  const now = Date.now();
  const totalBytes = rxBytes + txBytes;
  if (!prevNet || !prevNetTime) {
    prevNet = totalBytes;
    prevNetTime = now;
    return 0;
  }

  const elapsedSec = Math.max((now - prevNetTime) / 1000, 1);
  const deltaBytes = Math.max(0, totalBytes - prevNet);
  prevNet = totalBytes;
  prevNetTime = now;
  return Number((deltaBytes / 1024 / elapsedSec).toFixed(2));
}

function getTemperatureCelsius(cpuPercent) {
  const thermalDir = path.join(HOST_SYS, 'class/thermal');
  try {
    if (fs.existsSync(thermalDir)) {
      const zones = fs
        .readdirSync(thermalDir)
        .filter((name) => name.startsWith('thermal_zone'));
      for (const zone of zones) {
        const tempFile = path.join(thermalDir, zone, 'temp');
        if (fs.existsSync(tempFile)) {
          const raw = Number(fs.readFileSync(tempFile, 'utf8').trim());
          if (!Number.isNaN(raw) && raw > 0) {
            const celsius = raw > 1000 ? raw / 1000 : raw;
            return { value: Number(celsius.toFixed(1)), source: 'hardware_sensor' };
          }
        }
      }
    }
  } catch {
    // En instancias virtuales AWS EC2 el hipervisor suele ocultar los sensores físicos
  }

  const estimated = 38.0 + cpuPercent * 0.42;
  return { value: Number(estimated.toFixed(1)), source: 'estimated_from_cpu_load' };
}

async function sendMetrics() {
  try {
    const cpuPercent = getCpuPercent();
    const memory = getMemoryMetrics();
    const bandwidthKbps = getNetworkBandwidthKbps();
    const temp = getTemperatureCelsius(cpuPercent);
    const timeUnixNano = (BigInt(Date.now()) * 1000000n).toString();

    const payload = {
      resourceMetrics: [
        {
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: 'ec2-host-monitor' } },
            ],
          },
          scopeMetrics: [
            {
              scope: { name: 'ec2.infrastructure' },
              metrics: [
                {
                  name: 'ec2_cpu_usage_percent',
                  description: 'Porcentaje de uso de CPU del servidor',
                  unit: '%',
                  gauge: { dataPoints: [{ asDouble: cpuPercent, timeUnixNano }] },
                },
                {
                  name: 'ec2_memory_usage_percent',
                  description: 'Porcentaje de uso de memoria RAM del servidor',
                  unit: '%',
                  gauge: { dataPoints: [{ asDouble: memory.usedPercent, timeUnixNano }] },
                },
                {
                  name: 'ec2_memory_used_mb',
                  description: 'Memoria RAM utilizada en MB',
                  unit: 'MB',
                  gauge: { dataPoints: [{ asDouble: memory.usedMb, timeUnixNano }] },
                },
                {
                  name: 'ec2_network_bandwidth_kbps',
                  description: 'Ancho de banda de red (entrada + salida) en KB/s',
                  unit: 'KB/s',
                  gauge: { dataPoints: [{ asDouble: bandwidthKbps, timeUnixNano }] },
                },
                {
                  name: 'ec2_cpu_temperature_celsius',
                  description: 'Temperatura del procesador en grados Celsius',
                  unit: 'Cel',
                  gauge: {
                    dataPoints: [
                      {
                        asDouble: temp.value,
                        timeUnixNano,
                        attributes: [
                          { key: 'sensor_source', value: { stringValue: temp.source } },
                        ],
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const res = await fetch(OTEL_METRICS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error(`Error enviando métricas OTLP: HTTP ${res.status}`);
    }
  } catch (err) {
    console.error('Error recolectando/enviando métricas de infraestructura:', err.message);
  }
}

console.log(`Iniciando monitor de infraestructura hacia ${OTEL_METRICS_URL}`);
// Primera lectura para inicializar deltas de CPU/red
try {
  getCpuPercent();
  getNetworkBandwidthKbps();
} catch {}

setInterval(sendMetrics, INTERVAL_MS);