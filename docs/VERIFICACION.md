# Qué está verificado y qué falta comprobar

## Verificado con pruebas automáticas (`npm test`, 36 pruebas)
- Reloj: 1ª parte, descanso, 2ª parte en el minuto de la duración configurada, duraciones distintas, corrección, ajuste, pausa, tiempo añadido; las repeticiones no lo reinician.
- Eventos: gol con minuto y marcador inmediato, varios en el mismo minuto, jugadora/nota después, editar, **anular**, eliminar y deshacer dejan marcador e historial coherentes; auditoría de lo eliminado.
- Doble pulsación y reintentos (mismo identificador, otra conexión, tras reiniciar el servidor): no duplican.
- Eventos pulsados sin conexión conservan su instante real y su minuto.
- Persistencia: recargar, reconectar y reiniciar el servidor conserva partido y reloj; partidos anteriores y exportación CSV/JSON.
- Seguridad: las pantallas no pueden ordenar nada; el control exige clave/sesión; las credenciales de OBS no salen del portátil; límite de intentos; subida de escudos solo de imágenes.
- Clips contra un **OBS simulado que habla el protocolo real** (autenticación SHA256, búfer de repetición, `ReplayBufferSaved`) con vídeo que lleva grabado el instante real:
  el clip contiene exactamente 20 s antes y 10 s después (a escala de test) **compensando el retraso de cámara**; eventos seguidos dan archivos distintos con su propia jugada;
  archivo todavía escribiéndose; fallo puntual de OBS con reintento automático; OBS caído y reconectado; *Guardado* solo con archivo existente; reintento manual; comprobación y ajuste del búfer; contraseña incorrecta.
- Interfaz en navegador real: gol del móvil → pantalla de emisión → deshacer; pérdida de conexión → pendiente → reconexión sin duplicar; retraso de marcador/reloj y recarga sin reiniciar el reloj; las 4 distribuciones caben en su lienzo y respetan márgenes (capturas revisadas a 1920×1080, 1080×1920 y móvil).

- Plantilla importada desde texto, alineación por partido, cuenta atrás, animación de gol que espera el nombre de la jugadora, pantallas automáticas (previa, descanso, final), estadísticas y goleadoras de temporada: probado con pruebas y capturas.

## Hay que comprobarlo con vuestro material
0. **`actualizar.bat`** (PowerShell en Windows): escrito con cuidado pero no he podido ejecutarlo en Windows. Hace copia de seguridad de `data` antes de copiar nada.
1. **OBS real** (versión y WebSocket): el protocolo se implementó contra la documentación oficial vigente (obs-websocket 5.x), pero se probó con un simulador. Verificad la conexión,
   que `Ajustar búfer` aplica la duración en vuestra versión (puede requerir reiniciar OBS si el búfer no estaba activado) y que el archivo guardado se recorta bien con vuestra codificación.
2. **Falcon → OBS**: cómo llega la señal (NDI, RTMP, USB, captura…) no se asumió. Medid el retraso real con la guía de calibración. No se asumió ninguna API de la Falcon.
3. **Samsung/Windows**: rendimiento del recorte «Exacto» mientras OBS emite (si va justo, usad «Rápido» o recortad tras el partido), y el cortafuegos.
4. **Red**: que el punto de acceso del móvil 5G permita que el portátil y el móvil del mando se vean (aislamiento de clientes). Alternativas en la guía de red.
5. **Instagram Live Producer**: no se verificó acceso ni requisitos de la cuenta del club. La app no habla con Instagram: OBS envía la emisión con la clave/servidor que dé Live Producer.
   Comprobad que la cuenta puede emitir en vertical 9:16 y cuáles son los márgenes que tapa la interfaz (ajustables en Emisión → Márgenes).
6. **Fuentes tipográficas, brillo y legibilidad en exterior** del mando al sol.
