# Compatibility matrix

| Game | License | Mode/API | Resolution | Frame/input | RMS | Audio/online |
|---|---|---|---|---|---|---|
| Control Test (tests/fixture) | MIT, original source | Offline MIDP2/CLDC1.1 | 240×320 | Real Linux prototype passed | Separate working directory, persistent counter | Audio disabled; network not used |

No commercial games bundled or downloaded. No lawful online game/server was provided, so online compatibility is **not tested**. No claim for Nokia-specific APIs, M3G, 3D, vendor media or all MIDP/CLDC behaviors. Custom resolutions can be configured only within validated bounds; successful creation does not imply game compatibility.

Emulator source: https://github.com/TASEmulators/freej2me-plus/tree/baca76a4dda6f30abac67fb4a3db009eed05f91c . Build target and artifact were verified from build.xml. Runtime bridge uses MobilePlatform API and exact ISO_8859_1 encoding. Each instance's cwd/RMS/config is separate even when sharing JAR bytes.
