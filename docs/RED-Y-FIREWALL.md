# Red, cortafuegos y recuperación

## Montaje de red recomendado
Móvil con 5G → **conexión compartida (punto de acceso)**. El portátil y el móvil del mando se conectan a esa red. El portátil usa esa misma conexión para OBS → Instagram.
Dirección del mando: pestaña **Ajustes → Conexión** (QR + dirección tipo `http://192.168.x.x:3000/control`).

Si el móvil del mando no consigue abrir la dirección, puede ser el **aislamiento de clientes** del punto de acceso (algunos móviles no dejan que los dispositivos conectados se vean entre sí). **Esto hay que comprobarlo con vuestros móviles.** Alternativas:
- Móvil 5G por **cable USB** al portátil (anclaje USB) para internet, y **punto de acceso de Windows** del portátil (Configuración → Red → Zona con cobertura inalámbrica) para el móvil del mando.
- Una Wi-Fi o router portátil que permita comunicación entre dispositivos.

## Cortafuegos de Windows
Windows suele bloquear conexiones entrantes. Opción fácil: doble clic en **`permitir-firewall.bat`** (acepta el permiso de administrador). Crea una regla solo para la red local y cualquier tipo de red (los puntos de acceso suelen contar como «Pública»).

A mano (PowerShell como administrador):
```
netsh advfirewall firewall add rule name="FFSP Retransmision" dir=in action=allow protocol=TCP localport=3000 profile=any remoteip=localsubnet
```
Para quitarla: `netsh advfirewall firewall delete rule name="FFSP Retransmision"`.
También puede aparecer el aviso «Permitir que Node.js se comunique»: marca **Redes privadas y públicas**.

## Si algo falla
| Síntoma | Qué hacer |
|---|---|
| El mando muestra **Sin conexión** | Las pulsaciones quedan *pendientes* y se envían al volver. Comprueba que ambos están en la misma red y que `iniciar.bat` sigue abierto. Se reconecta sola (recarga la página si tarda). |
| El móvil no abre la dirección | Cambió la IP: mira la nueva en el portátil (ventana negra o Ajustes → Conexión) y vuelve a escanear el QR. Revisa el cortafuegos. |
| «Clave incorrecta» | Usa el QR, o la clave de la ventana negra. Se puede regenerar en Ajustes → Conexión. Tras 8 fallos hay una pausa de 1 minuto. |
| Se cerró la ventana negra / se reinició el portátil | Abre `iniciar.bat`: el partido, el reloj (continúa con la hora real) y los eventos se conservan en `data/`. |
| Puerto ocupado | Hay otra copia abierta. Ciérrala o arranca con otro puerto (`set PORT=3001`). |
| OBS no conecta | Revisa que el servidor WebSocket esté habilitado, el puerto y la contraseña (pestaña Clips muestra el motivo). Reintenta con *Reconectar OBS*. |
| Las pantallas de OBS se quedan en blanco | Clic derecho en la fuente → *Actualizar caché del navegador*. |
| Un clip falló | Pestaña Clips → *Reintentar*. |

Si hay que usar el portátil sin móvil: abre `http://localhost:3000/control` en el propio portátil; es el mismo mando.
