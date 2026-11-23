# Calibrar el retraso de la cámara

La señal de la Falcon llega a OBS con retraso respecto a lo que ves en el campo. Hay tres ajustes (pestaña **Emisión → Retrasos**):

| Ajuste | Para qué |
|---|---|
| **Retraso de la cámara** | Localizar el fragmento correcto al recortar clips. |
| **Marcador y avisos** | Que el gol aparezca en la emisión cuando la jugada llega en el vídeo. |
| **Reloj emitido** | Que el reloj de la emisión coincida con el vídeo. |

Normalmente los tres valen lo mismo (botón *Igualar*). Tu mando siempre confirma al instante: el retraso solo afecta a lo que ve el público y al clip.

## Medirlo (5 minutos, una vez por montaje)
1. En el portátil, añade a OBS una fuente **Navegador** con `http://localhost:3000/calibrate` (pequeña, junto al vídeo de la cámara). Muestra la hora del servidor con centésimas.
2. En el móvil del mando abre `http://IP-DEL-PORTÁTIL:3000/calibrate?clean=1` (brillo al máximo) y apunta la Falcon a esa pantalla.
3. En el monitor de OBS verás **dos relojes**: el de la fuente (tiempo real) y el que llega por la cámara (retrasado). Haz una captura de pantalla con las dos horas.
4. **Retraso = hora de la fuente − hora vista por la cámara.** Repite 3-4 veces y haz la media.
5. Escríbelo en *Retraso de la cámara* y pulsa *Igualar marcador y reloj…*.

## Comprobarlo con un clip
Con el valor puesto, en el móvil con `/calibrate` visible a la cámara, pulsa **Guardar jugada** cuando el reloj marque un segundo exacto (p. ej. :30.00).
Abre el clip: el segundo :30 debe aparecer a los **20 s** de vídeo (20 s anteriores). Si aparece antes/después, corrige el retraso en esa diferencia.
Tu tiempo de reacción al pulsar también queda absorbido si calibras de esta forma pulsando justo cuando ves el momento.

## Notas
- Si cambias la latencia de la cámara (modo de vídeo, distancia, red), repite la medida.
- El retraso de la emisión hacia Instagram no hay que compensarlo: es posterior a OBS y afecta igual a vídeo y marcador.
