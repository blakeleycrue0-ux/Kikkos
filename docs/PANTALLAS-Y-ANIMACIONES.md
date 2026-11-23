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
