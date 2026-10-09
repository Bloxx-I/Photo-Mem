# Photo-Mem 🧠

Gedächtnistraining als App – nach den drei Methoden aus dem Reel *„3 ways to develop photographic memory“*:

| | Methode | So funktioniert's |
|---|---|---|
| 🎯 | **Recall-Drill** | Zufällige Objekte ein paar Sekunden ansehen, dann aus einer gemischten Auswahl die richtigen antippen. 4 Stufen (6–16 Objekte). |
| 🗂️ | **Leitner-System** | Karteikarten in 5 Boxen (Wiederholung nach 1 / 2 / 4 / 8 / 16 Tagen). Gewusst → nächste Box, nicht gewusst → zurück in Box 1. |
| 📝 | **Blurting** | Text lesen, verdecken, alles aufschreiben **oder diktieren** – die App zeigt, welche Kernaussagen fehlen. |

**Inhalte sind schon dabei:**
- **6 Themenpakete** fürs Leitner-System: 🧠 Gehirn & Gedächtnis · 🚀 Weltraum · 🐙 Verrückte Tierwelt · 🏛️ Geschichte · 🧪 Alltagswissenschaft · 🤯 Denkfehler. Neue Karten werden schrittweise freigeschaltet (6 pro Tag).
- **8 Blurting-Texte:** Vergessenskurve, Bärtierchen, Apollo 11, Placebo-Effekt, Schwarze Löcher, Gedächtnispalast, Kraken, Der Schwarze Tod.
- Eigene Karten und Texte kannst du jederzeit ergänzen.

**Blurting versteht Umschreibungen:**
- Wortformen, zusammengesetzte Wörter, **Synonyme**, gesprochene Zahlen („dreizehnhundertachtundvierzig“ = 1348) und kleine Tippfehler werden erkannt – ideal für Diktat ohne Satzzeichen.
- 🎤 **Diktieren** direkt in der App (Chrome, Edge, Safari) oder über das Mikrofon der Handy-Tastatur.
- Optional **🧠 KI-Abgleich**: Ein mehrsprachiges Sprachmodell (~120 MB, einmaliger Download) erkennt auch Sätze mit ganz anderen Worten. Es läuft lokal auf deinem Gerät – deine Texte verlassen es nicht.
- Vergessene Kernaussagen werden per Klick zu Leitner-Karten.

---

## 📲 Installation

### Am Handy oder PC als App (empfohlen)

Öffne **https://bloxx-i.github.io/Photo-Mem/** und installiere die Seite als App:

| Gerät | So geht's |
|---|---|
| **iPhone / iPad** (Safari) | Teilen-Symbol ⬆️ → **„Zum Home-Bildschirm“** |
| **Android** (Chrome) | Menü ⋮ → **„App installieren“** bzw. „Zum Startbildschirm hinzufügen“ |
| **Windows / macOS / Linux** (Chrome, Edge) | In der Adressleiste auf das Installieren-Symbol ⊕ klicken (oder Menü ⋮ → „Photo-Mem installieren“) |

Danach startet Photo-Mem wie eine normale App und funktioniert auch offline.

> **Einmalig für den Repo-Besitzer:** Damit der Link funktioniert, unter **Settings → Pages → Build and deployment → Source** den Eintrag **„GitHub Actions“** wählen. Ab dann wird jeder Push automatisch veröffentlicht.

### Lokal per Terminal (macOS & Linux)

```bash
curl -fsSL https://raw.githubusercontent.com/Bloxx-I/Photo-Mem/HEAD/install.sh | sh
```

Benötigt `python3` und `curl`. Danach:

```bash
photo-mem            # App starten (öffnet http://localhost:8765)
photo-mem stop       # Server beenden
photo-mem update     # neueste Version installieren
photo-mem uninstall  # deinstallieren
```

Installiert wird nach `~/.local/share/photo-mem`, der Befehl liegt in `~/.local/bin/photo-mem` (unter Linux zusätzlich ein Eintrag im App-Menü).

### Ohne Installation ausprobieren

```bash
git clone https://github.com/Bloxx-I/Photo-Mem.git
cd Photo-Mem
python3 -m http.server 8000   # dann http://localhost:8000 öffnen
```

---

## 🗑️ Deinstallation

**Lerndaten löschen (alle Varianten):** In der App **Statistik → „Alles von diesem Gerät löschen“**. Das entfernt Karten, Texte, Statistik, den Offline-Speicher und das KI-Modell.

**App entfernen:**

| Installiert über | Entfernen |
|---|---|
| iPhone / iPad | App-Symbol lange drücken → **„App entfernen“** |
| Android | App-Symbol lange drücken → **„Deinstallieren“** |
| Chrome / Edge am PC | App öffnen → Menü ⋮ → **„Photo-Mem deinstallieren“** (Windows auch: Einstellungen → Apps) |
| Terminal-Installer | `photo-mem uninstall` |

Falls der Befehl `photo-mem` nicht mehr da ist:

```bash
curl -fsSL https://raw.githubusercontent.com/Bloxx-I/Photo-Mem/HEAD/uninstall.sh | sh
```

---

## Datenschutz

Alles bleibt auf deinem Gerät (`localStorage` im Browser). Es gibt keinen Server und kein Konto. Nur der optionale KI-Abgleich lädt einmalig das Sprachmodell von Hugging Face bzw. jsDelivr; die Auswertung selbst läuft lokal. Backups kannst du unter **Statistik → Backup exportieren** als JSON speichern.

## Projektstruktur

| Datei | Inhalt |
|---|---|
| `index.html`, `styles.css` | App-Gerüst und Design |
| `app.js` | Oberfläche, Drill, Leitner, Blurting, Statistik |
| `content.js` | Themenpakete, Blurting-Texte, Synonyme |
| `recall.js` | Blurting-Auswertung (Wortabgleich + optionaler KI-Abgleich) |
| `sw.js`, `manifest.webmanifest` | Offline-Fähigkeit und App-Installation |
| `install.sh`, `uninstall.sh` | Terminal-Installer für macOS/Linux |
