# FFSP · Control de retransmisiones

Aplicación local para el Club Femenino Santa Ponsa. Se ejecuta en el portátil (Windows), se controla desde el móvil y genera
las pantallas que OBS combina con el vídeo de la cámara, además de guardar clips automáticos de las jugadas.

- **Mando** (móvil): marcador, reloj, eventos, correcciones, clips y ajustes.
- **Pantallas de emisión** (OBS, solo lectura): *con cámara* (fondo transparente) y *sin cámara* (negro y lila), en horizontal 16:9 y vertical 9:16.
- **Clips**: conexión real con OBS (WebSocket 5.x) y recorte con FFmpeg a partir del búfer de repetición.
- Sin servicios de pago ni cuentas. Todo se guarda en la carpeta `data/` del portátil.

## 1. Arrancar (Windows)

1. Instala **Node.js LTS** (https://nodejs.org o `winget install OpenJS.NodeJS.LTS`). Es lo único que hay que instalar; FFmpeg se descarga solo con `npm install`.
2. Copia esta carpeta al portátil y haz doble clic en **`iniciar.bat`**. La primera vez instala los componentes (necesita internet).
3. Se abre el panel en el portátil y la ventana negra muestra la **clave de control** y las direcciones. Déjala abierta durante el partido.
4. Una vez, haz doble clic en **`permitir-firewall.bat`** (pide permiso de administrador) para que el móvil pueda conectarse. Ver [red y cortafuegos](docs/RED-Y-FIREWALL.md).

> Alternativa sin `.bat`: `npm install` y `npm start`. Puerto distinto: `set PORT=3001` antes de arrancar.

## 2. Abrir el mando en el móvil

Portátil y móvil en la **misma red** (p. ej. la conexión compartida del móvil con 5G). En el portátil: pestaña **Ajustes → Conexión**,
escanea el **QR** con el móvil. Entra directamente (la clave viaja en el QR y se guarda en el móvil). Si escribes la dirección a mano, pide la clave.

## 3. Preparar el partido

*Ajustes → Nuevo partido*: rival, fecha, categoría (sugiere duración, ajustable) y minutos de cada parte. Sube los escudos en
*Ajustes → Partido actual* (mientras falten se usan las iniciales). Hay un **partido de prueba** identificado ("PRUEBA") para ensayar
goles, tarjetas, descanso y correcciones: *Ajustes → Nuevo partido → Crear partido de prueba*.

## 4. Durante el partido (pestaña Directo)

Iniciar 1ª parte → Descanso → Iniciar 2ª parte (arranca en el minuto de la duración configurada) → Finalizar. Botones por equipo: Gol, Falta, Amarilla,
Roja, Cambio; *Guardar jugada* y *Deshacer último evento*. Toca cualquier evento para añadir jugadora/nota, cambiar el minuto, **anular** un gol (queda
tachado y no cuenta) o eliminarlo. El marcador se calcula siempre a partir de los eventos, así que nunca queda incoherente.
Si una pulsación no llega al portátil queda como **pendiente/fallida** en una franja visible y se reenvía sola sin duplicarse.

## 5. Más guías

- [OBS: fuentes, vertical, clips y búfer](docs/OBS.md)
- [Calibrar el retraso de la cámara](docs/CALIBRACION.md)
- [Red, cortafuegos y qué hacer si se pierde la conexión](docs/RED-Y-FIREWALL.md)
- [Qué está verificado y qué hay que comprobar con vuestro material](docs/VERIFICACION.md)

## Pruebas

`npm test` (motor del partido, servidor, clips contra un OBS simulado con FFmpeg y, si hay Playwright, interfaz en navegador real).
`npm run sample` genera un vídeo de muestra; en el navegador, `/preview/h` y `/preview/v` muestran las pantallas sobre él.
`node tools/screenshots.mjs carpeta` genera capturas de las distribuciones.
