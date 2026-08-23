# Crear tu propia imagen
Por defecto, BioPlatform usa las imagenes oficiales de [hub.docker.com](https://hub.docker.com/u/dracoservices), pero tambien puedes crear tu propias imagenes.

## Pasos
Para poder ejecutar, debes tener Docker descargado. Para verificar que tienes docker instalado, ejecuta
```bash
docker --version
```
Si sale que el comando no se encontrado, deberias ir a [docker.com](https://docker.com) y descargarte Docker, si usas Windows o MacOS (OS X). Si usas Linux, usa tu gestor de paquetes o el script oficial de la documentacion de Docker.

Ahora vamos a la parte de crear el image.

Para crear la imagen, debes ejecutar estos comandos:

### Linux o MacOS:
```bash
./scripts/build-frontend.sh
# o para el Backend
./scripts/build-backend.sh
```
### Windows
```powershell
./scripts/build-frontend.ps1
# o para el Backend
./scripts/build-backend.ps1
```
## Razones para crear tu propia imagen
Crear una imagen, es especialmente para hacer forks, y subir tu imagen como ``misupercuenta/bioplatform-frontend`` o/y ``misupercuenta/bioplatform-backend``. Tambien sirve para cuando quieres modificar algun ajuste del frontend, por ejemplo, como se ve la pagina principal, o modificar el Footer. 

Si no vas a hacer una cosa relacionada a lo indicado antes, no es **recomendable** crear tu propia imagen, debido a que puedes directamente usar la oficial del **[Docker Hub](https://hub.docker.com)**.