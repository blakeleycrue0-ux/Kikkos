# Pantalla sin cámara: pantallas, animaciones y contenido

Todo esto se controla desde el mando (pestaña **Directo → Qué se ve en pantalla** y **Ajustes**). La dirección de OBS no cambia: `/studio/v` (vertical) y `/studio/h` (horizontal).

## Pantallas
| Pantalla | Qué muestra |
|---|---|
| **Cuenta atrás** | Escudos y «COMIENZA EN mm:ss». Se activa con *Cuenta atrás: 5/10/15 min* en la previa. Añade los últimos resultados y la racha. |
| **Alineación** | Las titulares con dorsal y nombre sobre un campo, entrando una a una, y el entrenador. |
| **Marcador** | Escudos, goles, reloj, parte y línea del tiempo (lo más reciente arriba). |
| **Descanso** | Resultado, cuenta atrás de la 2ª parte, resumen de goles y tarjetas de la 1ª parte, estadísticas y patrocinadores. |
| **Estadísticas** | Faltas, amarillas, rojas y cambios por equipo, y el partido minuto a minuto. |
| **Final** | Resultado, jugadora del partido, racha, próximo partido, goles y tarjetas, estadísticas y mapa del partido. |
| **Patrocinadores** | Logos y mensajes a pantalla completa. |

En **Automática** (por defecto) la pantalla cambia sola: cuenta atrás antes de empezar, marcador durante el juego, descanso al pulsar *Descanso* y final al pulsar *Finalizar*. Si eliges otra, se queda fija hasta que vuelvas a Automática.

## Animación de gol
- **Gol del club**: pantalla completa con «GOL», escudo, dorsal y nombre, minuto, «2.º gol hoy · 7 en la temporada» y, si hay patrocinadores, «con el apoyo de».
- **Gol del rival**: aviso discreto con el minuto, sin nombre.
- Tras pulsar *Gol* (o *Amarilla/Roja*) del club, el móvil pregunta **¿quién ha sido?** con la plantilla (titulares primero). Un toque y la animación sale con ese nombre. Si no eliges en 12 s, o pulsas *Sin jugadora*, sale sin nombre. Se puede desactivar en Emisión.
- Los goles anulados muestran «GOL ANULADO».

## Plantilla, alineación y patrocinadores
- **Ajustes → Plantilla**: pega la lista del acta y pulsa *Importar*. Reconoce «Titulares», «Suplentes», «Entrenador:» y «DEL. Equipo:». Los nombres se muestran como «Nombre Apellido» y se pueden editar.
- **Ajustes → Alineación y jugadora del partido**: marca quién es titular en ese partido y elige la jugadora del partido (pantalla final).
- **Ajustes → Patrocinadores y cinta**: sube logos y escribe mensajes (uno por línea). La cinta rotatoria aparece abajo en las pantallas.
- **Ajustes → Club → Próximo partido**: texto para la pantalla final.

## Vídeo de patrocinadores en el descanso
Para un **vídeo** (no solo logos) se usa OBS: escena `Descanso` con un *Origen multimedia* en bucle, y cambias de escena con un clic. Ver [OBS](OBS.md).

## Lo que no hace
No lee comentarios, «me gusta» ni espectadores de Instagram. Lo que se ve es lo que registras tú.

## Estilo Pro (por defecto) y Estilo Clásico
En **Emisión → Pantalla sin cámara → Estilo** se elige entre **Pro** y **Clásico** (letra fina). Se cambia con un toque y sin reiniciar. Los dos usan **tu fondo lila y blanco**; el Pro solo usa blanco y lila.

Con el Estilo Pro:
- **Alineación**: «XI INICIAL» y una ficha angular por titular con **dorsal y nombre** (no hace falta ninguna foto individual); suplentes y entrenador debajo.
- **Gol**: «GOL» gigante en blanco con capas fantasma detrás; barra inferior con escudo, minuto, dorsal y nombre. Si una jugadora tiene foto, sale a un lado; si no, sale el escudo grande.
- **Descanso, final y cuenta atrás**: título grande, azulejos de marcador y, si has subido la **foto de grupo**, esa foto grande en el centro.
- **Estadísticas y resumen**: bloques lila con las barras de dos colores y el partido minuto a minuto.
- **Tarjetas, cambios y gol del rival**: avisos angulares con tarjeta grande.

## Fotos
- **Foto de grupo**: en **Emisión → Pantalla sin cámara → Subir foto del equipo**. Funciona mejor un **PNG sin fondo** (recortado). Sale en la cuenta atrás, el descanso y la final. En cada partido puedes cambiarla.
- **Fotos individuales** (opcional): en **Ajustes → Plantilla**, toca el cuadrado de la izquierda de la jugadora. Solo se usan en la animación de gol y en la jugadora del partido. Sin foto no pasa nada: no se muestra ninguna silueta.
- Las fotos se reducen en el móvil antes de subirse y se guardan en la carpeta `data` del portátil.
