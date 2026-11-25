require('./telemetry');

const app = require('./app');
const { initDb } = require('./db');

const PORT = process.env.PORT || 3000;

async function start() {
  await initDb();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `Backend corriendo en puerto ${PORT}`,
      })
    );
  });
}

start().catch((err) => {
  console.error('Error al iniciar el servidor:', err);
  process.exit(1);
});