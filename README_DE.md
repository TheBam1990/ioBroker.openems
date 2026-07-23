# ioBroker.openems

Dieser Adapter installiert, startet und überwacht OpenEMS Edge direkt innerhalb einer ioBroker-Instanz. Zusätzlich verwaltet er die offizielle OpenEMS UI und eine private Java-21-Laufzeit. Eine globale Java-Installation ist nicht erforderlich.

> Dies ist ein unabhängiger Community-Adapter. Er ist kein offizielles OpenEMS-Projekt und nicht mit der OpenEMS Association verbunden.

## Funktionen

- Bewusste Ein-Klick-Installation und Aktualisierung
- Offizielle OpenEMS-Edge- und UI-Pakete
- Eigene Eclipse-Temurin-Java-21-Laufzeit
- Atomare Aktivierung mit Rückfallschutz
- Dauerhafte OpenEMS-Konfigurations- und Datenordner
- Start-, Stop- und Neustartsteuerung
- Automatische Prüfung offizieller Releases
- Instanzlink im ioBroker-Admin
- Datenpunkte für Verbindung, Version, Java, Prozess und Speicher
- Unterstützung für Linux x64 und ARM64

## Installation

1. Adapter installieren und eine Instanz anlegen.
2. Instanzeinstellungen öffnen.
3. Einmal **OpenEMS nach dem Speichern installieren oder aktualisieren** aktivieren und speichern.
4. Warten, bis `openems.0.info.status` die erfolgreiche Installation meldet.
5. OpenEMS über den Instanzlink im ioBroker-Admin öffnen.

OpenEMS wird nicht allein durch die Installation des Adapterpakets heruntergeladen. Die Installation muss ausdrücklich ausgewählt oder über `control.installOrUpdate` gestartet werden.

Die Weboberfläche ist standardmäßig unter `http://IOBROKER-IP:8090` erreichbar. OpenEMS Edge verwendet Websocket-Port `8075`.

## Datenpunkte

- `info.installed`: OpenEMS Edge und UI sind installiert.
- `info.running`: der verwaltete OpenEMS-Edge-Prozess läuft.
- `info.connection`: der konfigurierte Edge-Websocket-Port ist erreichbar.
- `info.version`: installierte OpenEMS-Version.
- `info.latestVersion`: neueste offizielle Version.
- `info.updateAvailable`: eine neuere Version ist vorhanden.
- `info.url`: lokale Adresse der OpenEMS UI.
- `info.status` und `info.lastError`: Status und Fehlermeldungen.
- `runtime.*`: PID, Java-Version, Laufzeit und Speicherwerte.
- `control.installOrUpdate`, `control.start`, `control.stop`, `control.restart`: manuelle Bedienung.

## Speicherung und Updates

Alle verwalteten Dateien sowie die OpenEMS-Konfiguration liegen im Datenordner der ioBroker-Instanz. Bei Aktualisierungen bleiben die Konfigurationsdateien erhalten. Downloads werden zunächst separat geprüft und erst anschließend atomar aktiviert.

Der Adapter lädt eine Eclipse-Temurin-JRE über die offizielle Adoptium-Schnittstelle und OpenEMS Edge sowie UI aus den offiziellen GitHub-Releases.

## OpenEMS einrichten

OpenEMS ist ein modulares Energiemanagementsystem. Durch die Installation werden noch keine Zähler, Wechselrichter, Speicher oder Regelungen eingerichtet. Diese Komponenten werden anschließend in der OpenEMS UI konfiguriert. Die Standard-UI verbindet sich mit OpenEMS Edge über Websocket-Port 8075.

Beim ersten Start legt der Adapter die minimale offizielle Core-, Scheduler- und Websocket-Konfiguration an. Weitere erforderliche Basisdienste erzeugt OpenEMS selbst.

## Sicherheit

OpenEMS UI und Edge sind im lokalen Netzwerk erreichbar. Alle Standardpasswörter müssen bei der Ersteinrichtung geändert werden. Die Ports `8075`, `8080` und `8090` dürfen nicht direkt ins Internet weitergeleitet werden.

Das anfängliche Gastpasswort von OpenEMS lautet `user` und ist ausschließlich für die Ersteinrichtung vorgesehen.

## Unterstützte Systeme

Der Adapter unterstützt derzeit Linux auf x64 und ARM64. Vor der Installation müssen mindestens 450 MiB Speicherplatz frei sein. Je nach Komponenten und historischen Daten benötigt ein produktives OpenEMS-System deutlich mehr Arbeitsspeicher und Speicherplatz.

## Upstream-Projekte

- [OpenEMS](https://github.com/OpenEMS/openems)
- [OpenEMS-Dokumentation](https://openems.github.io/openems.io/openems/latest/introduction.html)
- [Eclipse Adoptium](https://adoptium.net/)

OpenEMS und enthaltene Komponenten behalten ihre jeweiligen Upstream-Lizenzen. Der ioBroker-Adapter selbst steht unter der MIT-Lizenz.

## Changelog

### 0.1.2

- Verwaltete Installation von OpenEMS Edge 2026.7.0 und OpenEMS UI
- Eigene Eclipse-Temurin-Java-21-Laufzeit
- Minimale offizielle Core-, Scheduler- und Websocket-Konfiguration
- Start-, Stop-, Neustart- und Aktualisierungssteuerung
- Instanzlink und Laufzeitdatenpunkte im ioBroker-Admin
- Unterstützung für Linux x64 und ARM64

Die vollständige Entwicklungshistorie steht in [CHANGELOG.md](CHANGELOG.md).

## Lizenz

MIT-Lizenz

Copyright (c) 2026 TheBam

Der vollständige Lizenztext steht in [LICENSE](LICENSE).
