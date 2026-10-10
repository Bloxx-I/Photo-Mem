# Photo-Mem 🧠

Gedächtnistraining als App – nach den drei Methoden aus dem Reel *„3 ways to develop photographic memory“*:

| | Methode | So funktioniert's |
|---|---|---|
| 🎯 | **Recall-Drill** | Zufällige Objekte ein paar Sekunden ansehen, dann aus einer gemischten Auswahl die richtigen antippen. 4 Stufen (6–16 Objekte). |
| 🗂️ | **Leitner-System** | Karteikarten in 5 Boxen (Wiederholung nach 1 / 2 / 4 / 8 / 16 Tagen). Gewusst → nächste Box, nicht gewusst → zurück in Box 1. |
| 📝 | **Blurting** | Text lesen, verdecken, alles aufschreiben **oder diktieren** – die App zeigt, welche Kernaussagen fehlen. |

**Die Schwierigkeit wächst mit dir.** Jeder Modus hat ein Level, das sich nach jeder Runde anpasst. Ziel sind etwa 75 % Erfolg – fordernd, aber machbar:

| Modus | Wird schwerer bei … | Wird leichter bei … | Was sich ändert |
|---|---|---|---|
| 🎯 Recall-Drill | ≥ 90 % | < 55 % | abwechselnd **ein Objekt mehr** oder **20 % weniger Zeit** (Level 1: 5 Objekte / 10 s … Level 32: 20 Objekte / 10 s) |
| 🗂️ Leitner | ≥ 90 % richtig | < 65 % richtig | **mehr neue Karten pro Tag** (4–13) und **längere Abstände** zwischen Wiederholungen |
| 📝 Blurting | ≥ 85 % | < 50 % | **kürzere Lesezeit** (ab Level 2), ab Level 5 eine **Ablenk-Pause** vor dem Schreiben |

Zwei wacklige Runden hintereinander (unter 70 %) gehen ebenfalls eine Stufe runter – so bleibt Erfolg immer erreichbar. Im Drill kannst du das Level auch selbst mit − / + setzen.

**Inhalte sind schon dabei:**
- **6 Themenpakete** fürs Leitner-System: 🧠 Gehirn & Gedächtnis · 🚀 Weltraum · 🐙 Verrückte Tierwelt · 🏛️ Geschichte · 🧪 Alltagswissenschaft · 🤯 Denkfehler. Neue Karten werden schrittweise freigeschaltet – wie viele pro Tag, hängt von deinem Level ab.
- **8 Blurting-Texte:** Vergessenskurve, Bärtierchen, Apollo 11, Placebo-Effekt, Schwarze Löcher, Gedächtnispalast, Kraken, Der Schwarze Tod.
- Eigene Karten und Texte kannst du jederzeit ergänzen.

**Blurting versteht Umschreibungen:**
- Wortformen, zusammengesetzte Wörter, **Synonyme**, gesprochene Zahlen („dreizehnhundertachtundvierzig“ = 1348) und kleine Tippfehler werden erkannt – ideal für Diktat ohne Satzzeichen.
- 🎤 **Diktieren** direkt in der App (Chrome, Edge, Safari) oder über das Mikrofon der Handy-Tastatur.
- Optional **🧠 KI-Abgleich**: Ein mehrsprachiges Sprachmodell (~120 MB, einmaliger Download) erkennt auch Sätze mit ganz anderen Worten. Es läuft lokal auf deinem Gerät – deine Texte verlassen es nicht.
- Vergessene Kernaussagen werden per Klick zu Leitner-Karten.

**Eigener KI-Server (optional):** Mit einem LLM und Whisper auf deinem Rechner (z. B. einer GPU-Workstation) wird Photo-Mem deutlich schlauer – siehe [KI-Server verbinden](#-ki-server-verbinden):
- das LLM **bewertet Blurting sinngemäß** und gibt kurzes Feedback,
- es **erzeugt neue Blurting-Texte und Kartenpakete** zu jedem Thema, das dich interessiert,
- **Whisper transkribiert dein Diktat** – genauer als die Browser-Spracherkennung.

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

## 🖥️ KI-Server verbinden

Photo-Mem spricht mit jedem **OpenAI-kompatiblen LLM-Server** (Ollama, llama.cpp `llama-server`, LM Studio, vLLM, LocalAI) und mit **Whisper** (speaches / faster-whisper-server, whisper.cpp `whisper-server`, whisper-asr-webservice). Es werden keine Daten an fremde Dienste geschickt.

### Empfohlen: Photo-Mem direkt auf dem KI-Server starten

So spricht der Browser nur mit einer Adresse – Photo-Mem leitet LLM- und Whisper-Anfragen intern weiter (`serve.py`, nur Python nötig). Dadurch gibt es keine CORS- oder HTTPS-Probleme.

Auf dem Server (Adressen an deine Dienste anpassen):

```bash
curl -fsSL https://raw.githubusercontent.com/Bloxx-I/Photo-Mem/HEAD/install.sh | \
  PHOTO_MEM_LLM_URL=http://localhost:11434 \
  PHOTO_MEM_WHISPER_URL=http://localhost:8000 \
  PHOTO_MEM_BIND=0.0.0.0 sh
photo-mem
```

Dann im Browser `http://<server-ip>:8765` öffnen – LLM und Whisper werden automatisch erkannt (⚙️ oben rechts zeigt den Status). Einstellungen ändern: `photo-mem config` zeigt die Datei, danach `photo-mem stop && photo-mem`.

Typische Ports: Ollama `11434`, llama.cpp `8080`, LM Studio `1234`, vLLM `8000`, speaches/faster-whisper `8000`, whisper-asr-webservice `9000`, whisper.cpp `8080`.

**Mikrofon am Handy braucht HTTPS.** Browser erlauben das Mikrofon nur über `https://` oder `localhost`. Am einfachsten mit [Tailscale](https://tailscale.com):

```bash
sudo tailscale cert r9700.dein-tailnet.ts.net
# in ~/.local/share/photo-mem/config eintragen:
PHOTO_MEM_TLS_CERT=/pfad/r9700.dein-tailnet.ts.net.crt
PHOTO_MEM_TLS_KEY=/pfad/r9700.dein-tailnet.ts.net.key
```

Dann `https://r9700.dein-tailnet.ts.net:8765` am Handy öffnen und als App installieren. (Alternativ: `tailscale serve --bg 8765`.) Ohne HTTPS funktioniert die Bewertung durchs LLM trotzdem – diktiert wird dann über das 🎤 der Handy-Tastatur.

### Alternativ: Server direkt eintragen

In der App ⚙️ → Server-Adresse eingeben → **Server suchen**. Das klappt, wenn
- die App über `http://` läuft (z. B. lokal mit `photo-mem`) – eine HTTPS-Seite wie GitHub Pages darf keine `http://`-Server im Heimnetz ansprechen, und
- der Server Anfragen aus dem Browser erlaubt (CORS). Bei Ollama: `OLLAMA_ORIGINS=*` setzen. llama.cpp und whisper.cpp erlauben das standardmäßig.

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

Alles bleibt auf deinem Gerät (`localStorage` im Browser). Es gibt keinen Server und kein Konto. Nur der optionale KI-Abgleich im Browser lädt einmalig das Sprachmodell von Hugging Face bzw. jsDelivr; die Auswertung selbst läuft lokal. Mit eigenem KI-Server gehen deine Antworten und Sprachaufnahmen nur an diesen Server. Backups kannst du unter **Statistik → Backup exportieren** als JSON speichern.

## Projektstruktur

| Datei | Inhalt |
|---|---|
| `index.html`, `styles.css` | App-Gerüst und Design |
| `app.js` | Oberfläche, Drill, Leitner, Blurting, Statistik |
| `content.js` | Themenpakete, Blurting-Texte, Synonyme |
| `recall.js` | Blurting-Auswertung (Wortabgleich + optionaler KI-Abgleich im Browser) |
| `ai.js` | Anbindung an deinen KI-Server (LLM-Bewertung, Themen erzeugen, Whisper) |
| `serve.py` | Mini-Server: liefert die App aus und leitet `/api/llm` und `/api/whisper` an deine KI-Dienste weiter |
| `sw.js`, `manifest.webmanifest` | Offline-Fähigkeit und App-Installation |
| `install.sh`, `uninstall.sh` | Terminal-Installer für macOS/Linux |
