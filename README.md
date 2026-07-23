# ioBroker.openems

This adapter installs, runs and monitors OpenEMS Edge directly inside an ioBroker instance. It also installs the official OpenEMS UI and a private Java 21 runtime, so no global Java installation is required.

> This is an independent community adapter. It is not an official OpenEMS project and is not affiliated with the OpenEMS Association.

## Features

- Explicit one-click installation and updates
- Official OpenEMS Edge and OpenEMS UI release artifacts
- Private Eclipse Temurin Java 21 runtime
- Atomic runtime activation with rollback protection
- Persistent OpenEMS configuration and data directories
- Start, stop and restart controls
- Automatic upstream release checks
- ioBroker Admin instance link
- Runtime, connection, version, Java and memory states
- Linux x64 and ARM64 support

## Installation

1. Install the adapter and create an instance.
2. Open the instance settings.
3. Enable **Install or update OpenEMS after saving** once, then save.
4. Wait until `openems.0.info.status` reports a successful installation.
5. Use the instance link in ioBroker Admin to open OpenEMS UI.

OpenEMS is never downloaded merely because the adapter package was installed. Clear the installation checkbox again after the requested installation; later updates can also be started through `control.installOrUpdate`.

The installed instance used for validation can be opened at `http://IOBROKER-IP:8090`. The standard OpenEMS Edge Websocket port is `8075`.

## Data points

- `info.installed`: OpenEMS Edge and UI are installed.
- `info.running`: the managed OpenEMS Edge process is running.
- `info.connection`: the configured Edge Websocket port is reachable.
- `info.version`: installed OpenEMS version.
- `info.latestVersion`: latest official release.
- `info.updateAvailable`: a newer release is available.
- `info.url`: local OpenEMS UI URL.
- `info.status` and `info.lastError`: operation details.
- `runtime.*`: PID, Java version, uptime and memory information.
- `control.installOrUpdate`, `control.start`, `control.stop`, `control.restart`: manual controls.

## Storage and updates

All managed files and OpenEMS configuration are stored in the ioBroker instance data directory. Updates replace Java, Edge and UI atomically. The OpenEMS configuration directory is preserved.

OpenEMS Edge requires Java 21 or later. The adapter retrieves an Eclipse Temurin JRE from the official Adoptium API and OpenEMS artifacts from the official OpenEMS GitHub releases.

## OpenEMS configuration

OpenEMS is a modular energy management framework. Installing it does not automatically configure meters, inverters, batteries or controllers. Configure those components in OpenEMS UI after installation. The standard UI connects to OpenEMS Edge on Websocket port 8075 by default.

The adapter creates the minimal official Core, Scheduler and Websocket configuration during first start. OpenEMS then creates its additional required base services.

## Security

OpenEMS UI and Edge are exposed on the local network unless a firewall restricts them. Change all default credentials during initial configuration and do not forward ports `8075`, `8080` or `8090` to the public internet.

Default upstream credentials are documented by OpenEMS and are intended only for initial setup. The initial guest password is `user`; other default account names and passwords must be changed immediately.

## Supported platform

The adapter currently supports Linux on x64 and ARM64. At least 450 MiB of free disk space is required before installation. A practical OpenEMS setup should have substantially more available memory and storage depending on enabled components and historical data.

## Upstream projects

- [OpenEMS](https://github.com/OpenEMS/openems)
- [OpenEMS documentation](https://openems.github.io/openems.io/openems/latest/introduction.html)
- [Eclipse Adoptium](https://adoptium.net/)

OpenEMS and its bundled components retain their respective upstream licenses. This adapter itself is licensed under the MIT License.
