# Third-party notices

FreeJ2ME-Plus: GPL-3.0-or-later with bundled ASM attribution/terms in LICENSE.FreeJ2ME-Plus. Pinned source and Git commit are retained in Docker image under /emulator; Bridge.java is GPL-3.0-or-later and its source is copied with the image. When distributing the combined emulator/bridge, provide corresponding source under the applicable GPL terms; do not strip it. Application UI/API and original ControlTest fixture are MIT. FreeJ2ME's bundled ObjectWeb ASM retains its separate BSD-style license.

Node dependencies and exact resolved artifacts are recorded in package-lock.json. Their individual LICENSE files remain in node_modules within the image. Java runtime is Eclipse Temurin/OpenJDK; preserve its legal notices. Docker base images are pinned by manifest digest in infra/Dockerfile; update deliberately with compatibility/security checks.

`runtime/lcdui/List.java` is based on the pinned FreeJ2ME-Plus List implementation and retains its GPL-3.0-or-later notice. The local addition maps rendered list rows and command-bar taps to native selection actions. It is copied into the emulator source before compilation; the original notice and modified source remain in the image.
