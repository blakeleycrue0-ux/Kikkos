# OBS: fuentes, vertical, clips

## Fuentes de navegador
En OBS: **Fuentes → + → Navegador**. Pega la dirección (la lista con botón *Copiar* está en la pestaña **Emisión**), pon ancho y alto y deja el CSS vacío.
Las direcciones usan `localhost` porque OBS corre en el mismo portátil, así que **no cambian** aunque cambie la red.

| Pantalla | Dirección | Tamaño |
|---|---|---|
| Con cámara, horizontal | `http://localhost:3000/overlay/h` | 1920 × 1080 |
| Con cámara, vertical | `http://localhost:3000/overlay/v` | 1080 × 1920 |
| Sin cámara, horizontal | `http://localhost:3000/studio/h` | 1920 × 1080 |
| Sin cámara, vertical | `http://localhost:3000/studio/v` | 1080 × 1920 |
| Automática | `http://localhost:3000/live` | sigue el modo/formato elegido en el mando |

Orden de capas en «con cámara»: cámara abajo, navegador `overlay` encima. «Sin cámara» ocupa todo el lienzo (no hace falta cámara).

## Vertical (9:16) con cámara: vídeo horizontal completo
1. Ajustes → Vídeo: resolución base y de salida **1080 × 1920**.
2. Fuente Navegador `overlay/v` de 1080 × 1920 en la capa superior.
3. Cámara debajo: clic derecho → Transformar → Editar transformación:
   alineación posicional *Centro*, posición **X 540, Y 960**, tipo de límite *Escalar al límite interior*, tamaño del límite **1080 × 607**.
4. Resultado: el vídeo 16:9 ocupa el centro a ancho completo, el marcador queda encima y los eventos recientes debajo.
5. En Emisión → vista previa vertical, la guía discontinua central marca exactamente ese recuadro. Ajusta los **márgenes** para que la interfaz de Instagram no tape nada.

## Sin la cámara: probar con el vídeo de muestra
`npm run sample` (o `iniciar.bat`) crea `data/sample/muestra.mp4`. En OBS: **Fuentes → + → Origen multimedia** → ese archivo → *Bucle*.
Sin OBS: abre `http://localhost:3000/preview/h` o `/preview/v`.

## Conectar OBS para guardar clips
1. OBS (versión 28 o superior ya incluye WebSocket): **Herramientas → Ajustes del servidor WebSocket** → *Habilitar servidor*, puerto 4455, activa la autenticación y fija una contraseña.
2. OBS → **Ajustes → Salida → Búfer de repetición** → *Activar búfer de repetición*. Pon **al menos 90 s** (la app avisa de cuánto necesita).
   Si usas modo de salida «Simple», el búfer se configura ahí; en «Avanzado», en la pestaña *Grabación/Búfer*.
3. En la app: **Ajustes → OBS y clips → Conexión con OBS** → dirección `127.0.0.1`, puerto, contraseña → *Guardar y conectar*. La contraseña se guarda solo en el portátil.
4. Pestaña **Clips**: debe decir *Conectado* y el búfer *Activo*. *Comprobar búfer* verifica la duración; *Ajustar búfer* la corrige y reinicia el búfer
   (si el búfer no está activado en OBS, hay que activarlo a mano y reiniciar OBS).
5. Ajustes → Clips: eventos que generan clip (por defecto gol, falta y jugada), 20 s antes / 10 s después, carpeta de destino.

### Cómo se localiza el fragmento
El clip no se saca "de lo que hay ahora": se calcula con el **instante real** del evento + el **retraso de la cámara**, y se espera a que haya llegado el vídeo posterior
(más un margen de seguridad). Entonces la app pide a OBS que guarde el búfer, espera a que el archivo exista y se termine de escribir, y FFmpeg recorta
**exactamente** esa ventana a un archivo propio. Eventos cercanos pueden salir de un mismo guardado de OBS, pero cada uno obtiene su propio recorte.
*Guardado* solo se muestra cuando el clip final existe y se puede leer. Si OBS no está, el clip espera mientras el búfer aún conserve el material; si ya no,
queda en *Error* con motivo y botón **Reintentar** (que vuelve a recortar del archivo de OBS o a guardar el búfer si todavía está disponible).

Los clips se guardan en `data/clips/<fecha>_<local>-<visitante>_<id>/` con nombres como `003_23min_Gol_FFSP_184512.mp4`. Se puede cambiar la carpeta.
Los clips también se abren desde el móvil (pestaña Clips).

### Detalles a tener en cuenta
- Recorte «Exacto» recodifica (~10-20 s por clip en un portátil medio, con prioridad baja). «Rápido» copia sin recodificar y corta en fotograma clave.
- Aun con clips, los eventos del partido se guardan siempre, con o sin OBS.
