# Create your own image
By default, BioPlatform uses the official images from [hub.docker.com](https://hub.docker.com/u/dracoservices), but you can also create your own images.

## Steps
To run this, you must have Docker installed. To verify that you have Docker installed, run:
```bash
docker --version
```
If you receive a message saying the command was not found, you should go to [docker.com](https://docker.com) and download Docker if you are using Windows or macOS (OS X). If you are using Linux, use your package manager or the official Docker documentation.

Now let's move on to creating the image.


To create the image, you must run these commands:

### Linux or MacOS:
```bash
./scripts/build-frontend.sh
# or for the Backend
./scripts/build-backend.sh
```
### Windows
```powershell
./scripts/build-frontend.ps1
# or for the Backend
./scripts/build-backend.ps1
```
## Reasons to create your own image
Creating an image is especially useful for forking and uploading your image as ``mysuperaccount/bioplatform-frontend`` or/and ``mysuperaccount/bioplatform-backend``. It's also useful when you want to modify some frontend settings, for example, how the homepage looks, or modify the footer.


If you are not going to do something related to what was mentioned before, it is not **recommended** to create your own image, because you can directly use the official one from **[Docker Hub](https://hub.docker.com)**.